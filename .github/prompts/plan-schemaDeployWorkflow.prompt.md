# Implementierungsplan: Schema-Deploy Workflow

## Ziel

Schema-Änderungen (Entity/Attribute erstellen/ändern/löschen) erscheinen in "Bereit zum Deploy" auf `/deploy` - analog zu Data-Commits, aber ohne Commit/Approve-Workflow.

## Flow

```
Entity/Attribute erstellen (entity.status='draft') 
→ schema_deployment (status='pending') 
→ Deploy-Seite zeigt "Bereit zum Deploy (1)"
→ Deploy klicken → entity.status='active', schema_deployment.status='deployed'
→ User führt generate_models.py aus → findet active Entity → generiert Models
```

## Implementierung

### Step 1: Bootstrap erweitern

**Datei:** `macros/bootstrap_mds.sql`

Neue Tabelle `mds_meta.schema_deployment` hinzufügen:

```sql
{% set schema_deployment_sql %}
-- mds_meta.schema_deployment Tabelle
-- Trackt pending Schema-Änderungen (Entity/Attribute) für Deploy
IF NOT EXISTS (SELECT * FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = 'mds_meta' AND t.name = 'schema_deployment')
CREATE TABLE mds_meta.schema_deployment (
    id INT IDENTITY(1,1) PRIMARY KEY,
    entity_id INT NOT NULL UNIQUE,  -- Eine Entity = ein Eintrag (gruppiert)
    status NVARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending' | 'deployed'
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NULL,
    deployed_at DATETIME2 NULL,
    deployed_by NVARCHAR(100) NULL,
    CONSTRAINT FK__schema_deployment__entity_id FOREIGN KEY (entity_id) REFERENCES mds_meta.entity(id) ON DELETE CASCADE
);
{% endset %}
```

Und im Ausführungsblock hinzufügen:
```sql
{{ log("Creating mds_meta.schema_deployment table...", info=True) }}
{% do run_query(schema_deployment_sql) %}
```

---

### Step 2: Model→Entity Kaskade entfernen

**Datei:** `src/app/api/models/[modelId]/route.ts`

Entfernen (Zeilen 108-131):
```typescript
// Cascade status changes to entities
if (status === 'draft' || status === 'deprecated') {
  await dbExecute(
    `UPDATE mds_meta.entity SET status = @status, ... WHERE model_id = @id AND status = 'active'`
  )
} else if (status === 'active') {
  await dbExecute(
    `UPDATE mds_meta.entity SET status = 'active', ... WHERE model_id = @id AND status = 'draft'`
  )
}
```

---

### Step 3: Attributes [attributeId] Route erstellen

**Neue Datei:** `src/app/api/attributes/[attributeId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, dbExecute } from '@/lib/db-server'

// GET - Single attribute
export async function GET(
  request: NextRequest,
  { params }: { params: { attributeId: string } }
) {
  const { attributeId } = params
  const result = await dbQuery(
    `SELECT a.*, e.code as entity_code, e.model_id
     FROM mds_meta.attribute a
     JOIN mds_meta.entity e ON a.entity_id = e.id
     WHERE a.id = @attributeId`,
    { attributeId: parseInt(attributeId) }
  )
  if (result.length === 0) {
    return NextResponse.json({ error: 'Attribute not found' }, { status: 404 })
  }
  return NextResponse.json(result[0])
}

// PUT - Update attribute
export async function PUT(
  request: NextRequest,
  { params }: { params: { attributeId: string } }
) {
  const { attributeId } = params
  const body = await request.json()
  const { code, name, data_type, max_length, is_required, is_business_key, is_unique, description } = body

  // Get entity_id for schema_deployment
  const attr = await dbQuery(
    `SELECT entity_id FROM mds_meta.attribute WHERE id = @attributeId`,
    { attributeId: parseInt(attributeId) }
  )
  if (attr.length === 0) {
    return NextResponse.json({ error: 'Attribute not found' }, { status: 404 })
  }
  const entityId = attr[0].entity_id

  // Check model is active
  const modelCheck = await dbQuery(
    `SELECT m.status FROM mds_meta.entity e 
     JOIN mds_meta.model m ON e.model_id = m.id 
     WHERE e.id = @entityId`,
    { entityId }
  )
  if (modelCheck.length === 0 || modelCheck[0].status !== 'active') {
    return NextResponse.json({ error: 'Model must be active' }, { status: 400 })
  }

  // Update attribute
  await dbExecute(
    `UPDATE mds_meta.attribute SET
       code = @code, name = @name, data_type = @data_type,
       max_length = @max_length, is_required = @is_required,
       is_business_key = @is_business_key, is_unique = @is_unique,
       description = @description, updated_at = GETUTCDATE()
     WHERE id = @attributeId`,
    { attributeId: parseInt(attributeId), code, name, data_type, max_length, is_required, is_business_key, is_unique, description }
  )

  // UPSERT schema_deployment
  await dbExecute(
    `MERGE mds_meta.schema_deployment AS target
     USING (SELECT @entityId AS entity_id) AS source
     ON target.entity_id = source.entity_id
     WHEN MATCHED THEN UPDATE SET updated_at = GETUTCDATE(), status = 'pending'
     WHEN NOT MATCHED THEN INSERT (entity_id, status) VALUES (@entityId, 'pending');`,
    { entityId }
  )

  return NextResponse.json({ success: true })
}

// DELETE - Delete attribute
export async function DELETE(
  request: NextRequest,
  { params }: { params: { attributeId: string } }
) {
  const { attributeId } = params

  // Get entity_id before delete
  const attr = await dbQuery(
    `SELECT entity_id FROM mds_meta.attribute WHERE id = @attributeId`,
    { attributeId: parseInt(attributeId) }
  )
  if (attr.length === 0) {
    return NextResponse.json({ error: 'Attribute not found' }, { status: 404 })
  }
  const entityId = attr[0].entity_id

  // Check model is active
  const modelCheck = await dbQuery(
    `SELECT m.status FROM mds_meta.entity e 
     JOIN mds_meta.model m ON e.model_id = m.id 
     WHERE e.id = @entityId`,
    { entityId }
  )
  if (modelCheck.length === 0 || modelCheck[0].status !== 'active') {
    return NextResponse.json({ error: 'Model must be active' }, { status: 400 })
  }

  // Delete attribute
  await dbExecute(
    `DELETE FROM mds_meta.attribute WHERE id = @attributeId`,
    { attributeId: parseInt(attributeId) }
  )

  // UPSERT schema_deployment
  await dbExecute(
    `MERGE mds_meta.schema_deployment AS target
     USING (SELECT @entityId AS entity_id) AS source
     ON target.entity_id = source.entity_id
     WHEN MATCHED THEN UPDATE SET updated_at = GETUTCDATE(), status = 'pending'
     WHEN NOT MATCHED THEN INSERT (entity_id, status) VALUES (@entityId, 'pending');`,
    { entityId }
  )

  return NextResponse.json({ success: true })
}
```

---

### Step 4: Schema-Deployment bei Entity-Änderungen

**Datei:** `src/app/api/entities/route.ts` (POST)

Nach erfolgreichem INSERT, UPSERT in schema_deployment:
```typescript
// Nach: const insertResult = await dbQuery(...)

// Check model is active
const modelCheck = await dbQuery(
  `SELECT status FROM mds_meta.model WHERE id = @model_id`,
  { model_id }
)
if (modelCheck[0]?.status === 'active') {
  await dbExecute(
    `INSERT INTO mds_meta.schema_deployment (entity_id, status) VALUES (@entityId, 'pending')`,
    { entityId: insertResult[0].id }
  )
}
```

**Datei:** `src/app/api/entities/[entityId]/route.ts` (PUT)

Nach erfolgreichem UPDATE:
```typescript
// Check model is active
const modelCheck = await dbQuery(
  `SELECT m.status FROM mds_meta.entity e 
   JOIN mds_meta.model m ON e.model_id = m.id 
   WHERE e.id = @entityId`,
  { entityId }
)
if (modelCheck[0]?.status === 'active') {
  await dbExecute(
    `MERGE mds_meta.schema_deployment AS target
     USING (SELECT @entityId AS entity_id) AS source
     ON target.entity_id = source.entity_id
     WHEN MATCHED THEN UPDATE SET updated_at = GETUTCDATE(), status = 'pending'
     WHEN NOT MATCHED THEN INSERT (entity_id, status) VALUES (@entityId, 'pending');`,
    { entityId }
  )
}
```

---

### Step 5: Schema-Deployment bei Attribute-Änderungen

**Datei:** `src/app/api/attributes/route.ts` (POST)

Nach erfolgreichem INSERT:
```typescript
// Check model is active
const modelCheck = await dbQuery(
  `SELECT m.status FROM mds_meta.entity e 
   JOIN mds_meta.model m ON e.model_id = m.id 
   WHERE e.id = @entity_id`,
  { entity_id }
)
if (modelCheck[0]?.status === 'active') {
  await dbExecute(
    `MERGE mds_meta.schema_deployment AS target
     USING (SELECT @entity_id AS entity_id) AS source
     ON target.entity_id = source.entity_id
     WHEN MATCHED THEN UPDATE SET updated_at = GETUTCDATE(), status = 'pending'
     WHEN NOT MATCHED THEN INSERT (entity_id, status) VALUES (@entity_id, 'pending');`,
    { entity_id }
  )
}
```

---

### Step 6: Commits API erweitern

**Datei:** `src/app/api/commits/route.ts`

Im GET Response zusätzlich schema_deployments_pending zurückgeben:
```typescript
// Nach den bestehenden Queries:
const schemaDeployments = await dbQuery(`
  SELECT COUNT(*) as pending_count
  FROM mds_meta.schema_deployment sd
  JOIN mds_meta.entity e ON sd.entity_id = e.id
  JOIN mds_meta.model m ON e.model_id = m.id
  WHERE sd.status = 'pending' AND m.status = 'active'
`)

// Im Response:
return NextResponse.json({
  data: commits,
  summary: { ...existingSummary },
  schema_deployments_pending: schemaDeployments[0]?.pending_count || 0
})
```

---

### Step 7: Deploy Page erweitern

**Datei:** `src/app/(app)/deploy/page.tsx`

1. Neuer State für Schema-Deployments:
```typescript
const [schemaDeployments, setSchemaDeployments] = useState<SchemaDeployment[]>([])
```

2. Fetch Schema-Deployments (neuer API-Endpunkt oder erweiterte commits API):
```typescript
// In fetchCommits oder separater Funktion:
const schemaRes = await fetch('/api/deploy/schema')
const schemaData = await schemaRes.json()
setSchemaDeployments(schemaData.data || [])
```

3. UI: Separate Section/Tab für Schema-Deployments (vor Data-Commits):
```tsx
{/* Schema Deployments Section */}
{schemaDeployments.length > 0 && (
  <Callout intent="primary" title={`Schema Changes (${schemaDeployments.length})`}>
    <HTMLTable>
      <thead><tr><th>Entity</th><th>Model</th><th>Changed</th><th>Actions</th></tr></thead>
      <tbody>
        {schemaDeployments.map(sd => (
          <tr key={sd.entity_id}>
            <td>{sd.entity_name}</td>
            <td>{sd.model_name}</td>
            <td>{formatDate(sd.updated_at || sd.created_at)}</td>
            <td><Button onClick={() => deploySchema(sd.entity_id)}>Deploy</Button></td>
          </tr>
        ))}
      </tbody>
    </HTMLTable>
  </Callout>
)}
```

---

### Step 8: Deploy API erweitern

**Neue Datei:** `src/app/api/deploy/schema/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { dbQuery, dbExecute } from '@/lib/db-server'

// GET - Pending schema deployments
export async function GET() {
  const result = await dbQuery(`
    SELECT 
      sd.id, sd.entity_id, sd.status, sd.created_at, sd.updated_at,
      e.code as entity_code, e.name as entity_name,
      m.code as model_code, m.name as model_name
    FROM mds_meta.schema_deployment sd
    JOIN mds_meta.entity e ON sd.entity_id = e.id
    JOIN mds_meta.model m ON e.model_id = m.id
    WHERE sd.status = 'pending' AND m.status = 'active'
    ORDER BY sd.created_at DESC
  `)
  return NextResponse.json({ data: result })
}

// POST - Deploy schema (activate entity)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { entity_ids, user = 'admin' } = body

  if (!entity_ids || !Array.isArray(entity_ids) || entity_ids.length === 0) {
    return NextResponse.json({ error: 'entity_ids array required' }, { status: 400 })
  }

  const results = []
  for (const entityId of entity_ids) {
    // Update entity status to active
    await dbExecute(
      `UPDATE mds_meta.entity SET status = 'active', updated_at = GETUTCDATE(), updated_by = @user WHERE id = @entityId`,
      { entityId, user }
    )
    
    // Update schema_deployment status to deployed
    await dbExecute(
      `UPDATE mds_meta.schema_deployment 
       SET status = 'deployed', deployed_at = GETUTCDATE(), deployed_by = @user 
       WHERE entity_id = @entityId`,
      { entityId, user }
    )
    
    results.push({ entity_id: entityId, status: 'deployed' })
  }

  return NextResponse.json({ 
    success: true, 
    deployed: results.length,
    message: `${results.length} Entity(s) aktiviert. Bitte 'python3 scripts/generate_models.py' ausführen um dbt Models zu generieren.`
  })
}
```

---

## Zusammenfassung der Dateien

| Datei | Aktion |
|-------|--------|
| `macros/bootstrap_mds.sql` | Neue Tabelle `schema_deployment` hinzufügen |
| `src/app/api/models/[modelId]/route.ts` | Kaskade entfernen (Zeilen 108-131) |
| `src/app/api/attributes/[attributeId]/route.ts` | **NEU** - PUT und DELETE |
| `src/app/api/entities/route.ts` | UPSERT schema_deployment bei POST |
| `src/app/api/entities/[entityId]/route.ts` | UPSERT schema_deployment bei PUT |
| `src/app/api/attributes/route.ts` | UPSERT schema_deployment bei POST |
| `src/app/api/commits/route.ts` | schema_deployments_pending im Response |
| `src/app/api/deploy/schema/route.ts` | **NEU** - GET pending, POST deploy |
| `src/app/(app)/deploy/page.tsx` | Schema-Deployments UI Section |

---

## Wichtige Regeln

1. **Model-Check:** Schema-Deployment nur erstellen wenn `model.status = 'active'`
2. **Gruppierung:** Eine Entity = ein Eintrag in schema_deployment (UPSERT/MERGE)
3. **generate_models.py:** Bleibt unverändert, filtert nach `entity.status = 'active'`
4. **Entity-Status:** Wird erst bei Schema-Deploy auf `active` gesetzt
