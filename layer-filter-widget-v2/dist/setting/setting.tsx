/** @jsx jsx */
import { React, jsx, Immutable, DataSourceManager, QueriableDataSource } from 'jimu-core'
import { AllWidgetSettingProps } from 'jimu-for-builder'
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { DataSourceSelector } from 'jimu-ui/advanced/data-source-selector'
import { AllDataSourceTypes } from 'jimu-core'
import { Checkbox, Label } from 'jimu-ui'
import { IMConfig } from '../config'

interface State {
  selectedDataSourceId: string
  availableFields: Array<{ name: string, alias: string, type: string }>
  loadingFields: boolean
}

export default class Setting extends React.PureComponent<AllWidgetSettingProps<IMConfig>, State> {
  constructor(props) {
    super(props)
    this.state = {
      selectedDataSourceId: this.props.config?.layerId || '',
      availableFields: [],
      loadingFields: false
    }
  }

  componentDidMount() {
    if (this.props.config?.layerId) {
      this.loadAvailableFields()
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.config?.layerId !== prevProps.config?.layerId && this.props.config?.layerId) {
      this.loadAvailableFields()
    }
  }

  loadAvailableFields = async () => {
    const { config } = this.props
    if (!config?.layerId) return

    this.setState({ loadingFields: true })

    try {
      const dataSource = DataSourceManager.getInstance().getDataSource(config.layerId) as QueriableDataSource
      if (dataSource && dataSource.layer) {
        // Get fields from the data source
        const fields = dataSource.layer.fields || []
        const availableFields = fields
          .filter(field => field.type === 'string' || field.type === 'small-integer' || field.type === 'integer' || field.type === 'double')
          .map(field => ({
            name: field.name,
            alias: field.alias || field.name,
            type: field.type
          }))

        this.setState({ availableFields, loadingFields: false })
      }
    } catch (error) {
      console.error('Error loading fields:', error)
      this.setState({ loadingFields: false })
    }
  }

  onToggleUseDataEnabled = (useDataSourcesEnabled: boolean) => {
    this.props.onSettingChange({
      id: this.props.id,
      useDataSourcesEnabled
    })
  }

  onDataSourceChange = (useDataSources) => {
    if (!useDataSources) {
      return
    }

    const layerId = useDataSources[0]?.dataSourceId || ''
    
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set('layerId', layerId).set('allowedFields', []),
      useDataSources: useDataSources
    })

    this.setState({ selectedDataSourceId: layerId })
  }

  onMapWidgetSelected = (useMapWidgetIds: string[]) => {
    this.props.onSettingChange({
      id: this.props.id,
      useMapWidgetIds: useMapWidgetIds
    })
  }

  onFieldToggle = (fieldName: string, checked: boolean) => {
    const { config } = this.props
    let allowedFields = config?.allowedFields || []

    if (checked) {
      // Add field if not already present
      if (!allowedFields.includes(fieldName)) {
        allowedFields = [...allowedFields, fieldName]
      }
    } else {
      // Remove field
      allowedFields = allowedFields.filter(f => f !== fieldName)
    }

    this.props.onSettingChange({
      id: this.props.id,
      config: config.set('allowedFields', allowedFields)
    })
  }

  render() {
    const { config, useDataSources } = this.props
    const { availableFields, loadingFields } = this.state
    const allowedFields = config?.allowedFields || []

    return (
      <div css={{
        width: '100%',
        height: '100%',
        padding: '16px'
      }}>
        <SettingSection title="Map Configuration">
          <SettingRow>
            <div css={{ width: '100%' }}>
              <label css={{ 
                display: 'block', 
                marginBottom: '8px',
                fontWeight: 'bold'
              }}>
                Select Map Widget:
              </label>
              <MapWidgetSelector
                onSelect={this.onMapWidgetSelected}
                useMapWidgetIds={this.props.useMapWidgetIds}
              />
            </div>
          </SettingRow>
        </SettingSection>

        <SettingSection title="Data Source Configuration">
          <SettingRow>
            <div css={{ width: '100%' }}>
              <label css={{ 
                display: 'block', 
                marginBottom: '8px',
                fontWeight: 'bold'
              }}>
                Select Layer to Filter:
              </label>
              <DataSourceSelector
                types={Immutable([AllDataSourceTypes.FeatureLayer])}
                useDataSources={useDataSources}
                mustUseDataSource
                onChange={this.onDataSourceChange}
                widgetId={this.props.id}
              />
            </div>
          </SettingRow>
          
          {config?.layerId && (
            <SettingRow>
              <div css={{
                padding: '12px',
                backgroundColor: '#f0f8ff',
                borderRadius: '4px',
                border: '1px solid #d1ecf1'
              }}>
                <p css={{ margin: 0, fontSize: '14px', color: '#0c5460' }}>
                  <strong>Selected Layer ID:</strong> {config.layerId}
                </p>
              </div>
            </SettingRow>
          )}
        </SettingSection>

        {config?.layerId && (
          <SettingSection title="Field Configuration">
            <SettingRow>
              <div css={{ width: '100%' }}>
                <label css={{ 
                  display: 'block', 
                  marginBottom: '12px',
                  fontWeight: 'bold'
                }}>
                  Select Fields Available to Users:
                </label>
                
                {loadingFields ? (
                  <div css={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                    Loading available fields...
                  </div>
                ) : availableFields.length > 0 ? (
                  <div css={{
                    maxHeight: '300px',
                    overflowY: 'auto',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                    padding: '8px'
                  }}>
                    {availableFields.map(field => (
                      <div key={field.name} css={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px',
                        borderBottom: '1px solid #f0f0f0'
                      }}>
                        <Checkbox
                          checked={allowedFields.includes(field.name)}
                          onChange={(e) => this.onFieldToggle(field.name, e.target.checked)}
                          css={{ marginRight: '12px' }}
                        />
                        <div css={{ flex: 1 }}>
                          <div css={{ fontWeight: 'bold', fontSize: '14px' }}>
                            {field.alias}
                          </div>
                          <div css={{ fontSize: '12px', color: '#fcfcfc' }}>
                            {field.name} ({field.type})
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div css={{ padding: '16px', textAlign: 'center', color: '#ffffff' }}>
                    No compatible fields found in the selected layer.
                  </div>
                )}

                {allowedFields.length > 0 && (
                  <div css={{
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: '#484a4b',
                    borderRadius: '4px'
                  }}>
                    <strong>Selected Fields ({allowedFields.length}):</strong>
                    <div css={{ marginTop: '4px', fontSize: '12px' }}>
                      {allowedFields.join(', ')}
                    </div>
                  </div>
                )}
              </div>
            </SettingRow>
          </SettingSection>
        )}

        <SettingSection title="Widget Information">
          <SettingRow>
            <div css={{
              padding: '16px',
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              border: '1px solid #dee2e6'
            }}>
              <h4 css={{ margin: '0 0 12px 0', color: '#495057' }}>
                Layer Filter Widget
              </h4>
              <ul css={{ 
                margin: 0, 
                paddingLeft: '20px',
                fontSize: '14px',
                color: '#6c757d',
                lineHeight: '1.5'
              }}>
                <li>Allows users to filter the selected layer by configured field values</li>
                <li>Only shows fields that you select above</li>
                <li>Provides search functionality for field values</li>
                <li>Automatically zooms to filtered features</li>
                <li>Includes clear filter functionality</li>
              </ul>
            </div>
          </SettingRow>
        </SettingSection>
      </div>
    )
  }
}