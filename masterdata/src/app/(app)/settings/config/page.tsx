'use client'

import { useState } from 'react'
import {
  Button,
  Card,
  FormGroup,
  InputGroup,
  HTMLSelect,
  Switch,
  Callout,
  Divider,
  Tag,
  Tabs,
  Tab,
  Icon
} from '@blueprintjs/core'
import { Header } from '@/components/layout/Header'

interface DatabaseConnection {
  id: string
  name: string
  type: 'azure-sql' | 'postgresql' | 'synapse'
  host: string
  database: string
  status: 'connected' | 'error' | 'disconnected'
}

export default function ConfigPage() {
  const [selectedTab, setSelectedTab] = useState('general')
  
  // General settings
  const [tenantName, setTenantName] = useState('Werkportal')
  const tenantId = 'werkportal'  // Read-only tenant identifier
  
  // dbt settings
  const [dbtTarget, setDbtTarget] = useState('werkportal')
  const [dbtProjectPath, setDbtProjectPath] = useState('/home/user/projects/datavault-dbt')
  const [dbtAutoRun, setDbtAutoRun] = useState(true)
  
  // Commit settings
  const [requireApproval, setRequireApproval] = useState(true)
  const [minApprovers, setMinApprovers] = useState(1)
  const [autoDeployApproved, setAutoDeployApproved] = useState(false)
  
  // Validation settings
  const [enableDQChecks, setEnableDQChecks] = useState(true)
  const [dqThreshold, setDqThreshold] = useState(95)
  const [blockOnDQFail, setBlockOnDQFail] = useState(true)

  const connections: DatabaseConnection[] = [
    {
      id: 'conn-001',
      name: 'Data Vault (Target)',
      type: 'azure-sql',
      host: 'sql-datavault-weu-001.database.windows.net',
      database: 'Vault_Werkportal',
      status: 'connected'
    },
    {
      id: 'conn-002',
      name: 'PostgreSQL Source',
      type: 'postgresql',
      host: '10.0.0.15',
      database: 'werkportal',
      status: 'connected'
    }
  ]

  const getStatusColor = (status: DatabaseConnection['status']) => {
    switch (status) {
      case 'connected': return 'success'
      case 'error': return 'danger'
      case 'disconnected': return 'none'
    }
  }

  const handleTestConnection = (conn: DatabaseConnection) => {
    // Mock test
    alert(`Testing connection to ${conn.name}...`)
  }

  return (
    <>
      <Header title="Configuration" breadcrumb={['Settings', 'Configuration']} />

      <div className="page-content">
        <Tabs
          id="config-tabs"
          selectedTabId={selectedTab}
          onChange={(newTab) => setSelectedTab(newTab as string)}
          large
        >
          <Tab id="general" title="General" />
          <Tab id="dbt" title="dbt Settings" />
          <Tab id="workflow" title="Workflow" />
          <Tab id="connections" title="Connections" />
        </Tabs>

        <div style={{ marginTop: 24 }}>
          {/* General Settings */}
          {selectedTab === 'general' && (
            <Card>
              <h3 style={{ marginTop: 0 }}>Tenant Settings</h3>
              
              <FormGroup label="Tenant Name" labelInfo="(required)">
                <InputGroup
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="My Company"
                />
              </FormGroup>

              <FormGroup label="Tenant ID" labelInfo="(read-only)">
                <InputGroup
                  value={tenantId}
                  disabled
                  leftIcon="tag"
                />
              </FormGroup>

              <Divider style={{ margin: '24px 0' }} />

              <h3>Display Settings</h3>

              <FormGroup label="Default Language">
                <HTMLSelect defaultValue="de">
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                </HTMLSelect>
              </FormGroup>

              <FormGroup label="Date Format">
                <HTMLSelect defaultValue="dd.MM.yyyy">
                  <option value="dd.MM.yyyy">DD.MM.YYYY</option>
                  <option value="yyyy-MM-dd">YYYY-MM-DD</option>
                  <option value="MM/dd/yyyy">MM/DD/YYYY</option>
                </HTMLSelect>
              </FormGroup>

              <div style={{ marginTop: 24 }}>
                <Button intent="primary">Save Changes</Button>
              </div>
            </Card>
          )}

          {/* dbt Settings */}
          {selectedTab === 'dbt' && (
            <Card>
              <h3 style={{ marginTop: 0 }}>dbt Configuration</h3>

              <Callout intent="primary" icon="info-sign" style={{ marginBottom: 16 }}>
                These settings control how dbt integrates with the Master Data Services.
              </Callout>

              <FormGroup label="dbt Target" helperText="Target profile from profiles.yml">
                <HTMLSelect
                  value={dbtTarget}
                  onChange={(e) => setDbtTarget(e.target.value)}
                >
                  <option value="dev">dev (Shared Development)</option>
                  <option value="werkportal">werkportal (Production)</option>
                  <option value="ewb">ewb (Future)</option>
                </HTMLSelect>
              </FormGroup>

              <FormGroup label="Project Path" helperText="Path to dbt project on server">
                <InputGroup
                  value={dbtProjectPath}
                  onChange={(e) => setDbtProjectPath(e.target.value)}
                  leftIcon="folder-open"
                />
              </FormGroup>

              <Divider style={{ margin: '24px 0' }} />

              <h3>Automation</h3>

              <Switch
                label="Auto-run dbt on deploy"
                checked={dbtAutoRun}
                onChange={(e) => setDbtAutoRun(e.target.checked)}
              />
              <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>
                Automatically execute dbt run when changes are deployed
              </p>

              <FormGroup label="dbt Commands">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button small icon="play" intent="primary">dbt run</Button>
                  <Button small icon="lab-test">dbt test</Button>
                  <Button small icon="code">dbt compile</Button>
                  <Button small icon="console">dbt debug</Button>
                </div>
              </FormGroup>

              <div style={{ marginTop: 24 }}>
                <Button intent="primary">Save Changes</Button>
              </div>
            </Card>
          )}

          {/* Workflow Settings */}
          {selectedTab === 'workflow' && (
            <Card>
              <h3 style={{ marginTop: 0 }}>Approval Workflow</h3>

              <Switch
                label="Require approval for commits"
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
              />

              {requireApproval && (
                <FormGroup 
                  label="Minimum Approvers" 
                  style={{ marginTop: 16 }}
                  helperText="Number of approvals required before deploy"
                >
                  <HTMLSelect
                    value={minApprovers}
                    onChange={(e) => setMinApprovers(Number(e.target.value))}
                  >
                    <option value={1}>1 Approver</option>
                    <option value={2}>2 Approvers</option>
                    <option value={3}>3 Approvers</option>
                  </HTMLSelect>
                </FormGroup>
              )}

              <Switch
                label="Auto-deploy after approval"
                checked={autoDeployApproved}
                onChange={(e) => setAutoDeployApproved(e.target.checked)}
                style={{ marginTop: 16 }}
              />
              <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>
                Automatically deploy changes when approval threshold is met
              </p>

              <Divider style={{ margin: '24px 0' }} />

              <h3>Data Quality</h3>

              <Switch
                label="Enable DQ validation before commit"
                checked={enableDQChecks}
                onChange={(e) => setEnableDQChecks(e.target.checked)}
              />

              {enableDQChecks && (
                <>
                  <FormGroup 
                    label="DQ Score Threshold (%)" 
                    style={{ marginTop: 16 }}
                    helperText="Minimum quality score required"
                  >
                    <InputGroup
                      type="number"
                      value={dqThreshold.toString()}
                      onChange={(e) => setDqThreshold(Number(e.target.value))}
                      min={0}
                      max={100}
                      style={{ width: 100 }}
                    />
                  </FormGroup>

                  <Switch
                    label="Block commits on DQ failure"
                    checked={blockOnDQFail}
                    onChange={(e) => setBlockOnDQFail(e.target.checked)}
                    style={{ marginTop: 16 }}
                  />
                </>
              )}

              <div style={{ marginTop: 24 }}>
                <Button intent="primary">Save Changes</Button>
              </div>
            </Card>
          )}

          {/* Connections */}
          {selectedTab === 'connections' && (
            <>
              <div className="section-header" style={{ marginBottom: 16 }}>
                <h3 style={{ margin: 0 }}>Database Connections</h3>
                <Button icon="add" intent="primary">Add Connection</Button>
              </div>

              {connections.map(conn => (
                <Card key={conn.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Icon 
                        icon="database" 
                        size={24} 
                        color={conn.status === 'connected' ? '#0f9960' : '#a7b6c2'}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong>{conn.name}</strong>
                          <Tag minimal intent={getStatusColor(conn.status)}>
                            {conn.status}
                          </Tag>
                        </div>
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          {conn.type} • {conn.host} • {conn.database}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button small icon="refresh" onClick={() => handleTestConnection(conn)}>
                        Test
                      </Button>
                      <Button small icon="edit">Edit</Button>
                    </div>
                  </div>
                </Card>
              ))}

              <Callout icon="info-sign" style={{ marginTop: 24 }}>
                <strong>ADLS Configuration:</strong> Data Lake connections are managed via Azure Synapse pipelines.
              </Callout>
            </>
          )}
        </div>
      </div>
    </>
  )
}
