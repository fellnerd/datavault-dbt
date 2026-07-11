/*
 * Security-Fundament: Schema sec + Berechtigungstabellen
 *
 * Ausfuehrung: einmalig pro Tenant-Datenbank (datavault, datavault-dev,
 * datavault-test, Vault_Jira, ...) durch einen DB-Admin in SSMS.
 * Reihenfolge: 01 -> 02 -> 03, danach security/privileges/insert_sec_special_user_privilege.sql
 * (dbt-Service-User-Exemption) VOR der ersten Security Policy!
 *
 * Azure SQL Database kompatibel (kein USE, keine Cross-DB-Referenzen).
 */

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'sec')
    EXEC('CREATE SCHEMA sec');
GO

/* ---------------------------------------------------------------
 * sec.sec_user_privilege - Einzelberechtigungen (RLS + CLS)
 *
 * user_name:        UPN des Entra-Users (vorname.nachname@domain.tld)
 *                   bzw. SQL-Login-Name. Matching via ORIGINAL_LOGIN().
 * security_context: fachlicher Kontext, z.B. 'finance', 'person_pii'
 * sec_value_key:    RLS-Filterwert, hierarchisch via '||':
 *                     'ewb'          -> alle Zeilen des Mandanten ewb
 *                     'ewb||0100'    -> nur Kontextwert 0100
 *                   Fuer CLS-Kontexte (nur ja/nein) Konvention: '*'
 * valid_from/to:    optionaler Gueltigkeitszeitraum (UTC)
 * --------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
               WHERE s.name = 'sec' AND t.name = 'sec_user_privilege')
BEGIN
    CREATE TABLE sec.sec_user_privilege (
        sec_user_privilege_key  INT IDENTITY(1,1) NOT NULL
            CONSTRAINT pk_sec_user_privilege PRIMARY KEY,
        user_name               NVARCHAR(255) NOT NULL,
        security_context        NVARCHAR(100) NOT NULL,
        sec_value_key           NVARCHAR(500) NOT NULL,
        valid_from              DATETIME2(0)  NULL,
        valid_to                DATETIME2(0)  NULL,
        description             NVARCHAR(500) NULL,
        created_at              DATETIME2(0)  NOT NULL
            CONSTRAINT df_sec_user_privilege_created_at DEFAULT SYSUTCDATETIME(),
        created_by              NVARCHAR(255) NOT NULL
            CONSTRAINT df_sec_user_privilege_created_by DEFAULT ORIGINAL_LOGIN()
    );

    CREATE NONCLUSTERED INDEX ix_sec_user_privilege_user_context
        ON sec.sec_user_privilege (user_name, security_context)
        INCLUDE (sec_value_key, valid_from, valid_to);
END
GO

/* ---------------------------------------------------------------
 * sec.sec_special_user_privilege - Sonderrechte
 *
 * no_sec = 1: Global-Admin / Service-User -> kompletter RLS/CLS-Bypass
 *             (security_context = NULL). NUR fuer dbt-Service-User
 *             und Security-Admins!
 * no_sec = 2: Kontext-Admin -> Bypass nur fuer den angegebenen
 *             security_context.
 * --------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
               WHERE s.name = 'sec' AND t.name = 'sec_special_user_privilege')
BEGIN
    CREATE TABLE sec.sec_special_user_privilege (
        sec_special_user_privilege_key INT IDENTITY(1,1) NOT NULL
            CONSTRAINT pk_sec_special_user_privilege PRIMARY KEY,
        user_name               NVARCHAR(255) NOT NULL,
        security_context        NVARCHAR(100) NULL,
        no_sec                  TINYINT       NOT NULL
            CONSTRAINT ck_sec_special_user_privilege_no_sec CHECK (no_sec IN (1, 2)),
        description             NVARCHAR(500) NULL,
        created_at              DATETIME2(0)  NOT NULL
            CONSTRAINT df_sec_special_user_privilege_created_at DEFAULT SYSUTCDATETIME(),
        created_by              NVARCHAR(255) NOT NULL
            CONSTRAINT df_sec_special_user_privilege_created_by DEFAULT ORIGINAL_LOGIN()
    );

    CREATE NONCLUSTERED INDEX ix_sec_special_user_privilege_user
        ON sec.sec_special_user_privilege (user_name)
        INCLUDE (security_context, no_sec);
END
GO

/* ---------------------------------------------------------------
 * sec.sec_group_privilege - Gruppenberechtigungen (Entra-Gruppen)
 *
 * Tagesgeschaeft der RLS-Vergabe: statt Einzel-Rows pro User wird
 * die Entra-Gruppenmitgliedschaft geprueft (IS_MEMBER in fn_check_rls).
 * Eine Row pro Gruppe x Kontext x Filterwert.
 *
 * group_name: Anzeigename der Entra-Gruppe, z.B. 'sg-datavault-finance-ro'
 * --------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
               WHERE s.name = 'sec' AND t.name = 'sec_group_privilege')
BEGIN
    CREATE TABLE sec.sec_group_privilege (
        sec_group_privilege_key INT IDENTITY(1,1) NOT NULL
            CONSTRAINT pk_sec_group_privilege PRIMARY KEY,
        group_name              NVARCHAR(255) NOT NULL,
        security_context        NVARCHAR(100) NOT NULL,
        sec_value_key           NVARCHAR(500) NOT NULL,
        description             NVARCHAR(500) NULL,
        created_at              DATETIME2(0)  NOT NULL
            CONSTRAINT df_sec_group_privilege_created_at DEFAULT SYSUTCDATETIME(),
        created_by              NVARCHAR(255) NOT NULL
            CONSTRAINT df_sec_group_privilege_created_by DEFAULT ORIGINAL_LOGIN()
    );

    CREATE NONCLUSTERED INDEX ix_sec_group_privilege_context
        ON sec.sec_group_privilege (security_context)
        INCLUDE (group_name, sec_value_key);
END
GO
