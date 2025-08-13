/** @jsx jsx */
import { React, jsx, AllWidgetProps, IMState, ReactRedux, DataSourceManager, QueriableDataSource, DataSource } from 'jimu-core'
import { JimuMapViewComponent, JimuMapView } from 'jimu-arcgis'
import { Select, Option, TextInput, Button, Loading } from 'jimu-ui'
import FeatureLayer from 'esri/layers/FeatureLayer'
import { IMConfig } from '../config'

interface State {
  jimuMapView: JimuMapView
  selectedField: string
  searchValue: string
  uniqueValues: string[]
  selectedValue: string
  loading: boolean
  layer: FeatureLayer
  jimuLayerView: any
}

export default class Widget extends React.PureComponent<AllWidgetProps<IMConfig>, State> {
  constructor(props) {
    super(props)
    this.state = {
      jimuMapView: null,
      selectedField: '',
      searchValue: '',
      uniqueValues: [],
      selectedValue: '',
      loading: false,
      layer: null,
      jimuLayerView: null
    }
  }

  componentDidUpdate(prevProps: AllWidgetProps<IMConfig>) {
    if (this.props.config?.layerId !== prevProps.config?.layerId && this.state.jimuMapView) {
      this.loadLayer()
    }
  }

  onActiveViewChange = (jmv: JimuMapView) => {
    if (jmv) {
      this.setState({ jimuMapView: jmv }, () => {
        this.loadLayer()
      })
    }
  }

  loadLayer = async () => {
    const { config } = this.props
    const { jimuMapView } = this.state

    if (!config?.layerId || !jimuMapView) return

    try {
      // Find the jimuLayerView using the configured layerId
      const jimuLayerViews = jimuMapView.jimuLayerViews
      let targetJimuLayerView = null

      // Search through all jimuLayerViews to find the one with matching layerId
      for (const [key, jimuLayerView] of Object.entries(jimuLayerViews)) {
        if (jimuLayerView.layerDataSourceId === config.layerId) {
          targetJimuLayerView = jimuLayerView
          break
        }
      }

      if (targetJimuLayerView) {
        // Use the recommended method to create layer data source
        const layerDataSource = await targetJimuLayerView.createLayerDataSource()
        
        if (layerDataSource && layerDataSource.layer) {
          const layer = layerDataSource.layer as FeatureLayer
          this.setState({ layer, jimuLayerView: targetJimuLayerView })
        }
      } else {
        // Fallback: try to find layer directly in the map
        const layer = jimuMapView.view.map.findLayerById(config.layerId) as FeatureLayer
        if (layer) {
          this.setState({ layer })
        }
      }
    } catch (error) {
      console.error('Error loading layer:', error)
    }
  }

  onFieldChange = async (evt) => {
    const fieldName = evt.target.value
    this.setState({ selectedField: fieldName, loading: true, uniqueValues: [], selectedValue: '' })

    if (!fieldName || !this.state.layer) {
      this.setState({ loading: false })
      return
    }

    try {
      const query = this.state.layer.createQuery()
      query.returnDistinctValues = true
      query.outFields = [fieldName]
      query.returnGeometry = false

      const result = await this.state.layer.queryFeatures(query)
      const values = result.features
        .map(feature => feature.attributes[fieldName])
        .filter(value => value != null && value !== '')
        .sort()

      this.setState({ uniqueValues: values, loading: false })
    } catch (error) {
      console.error('Error querying unique values:', error)
      this.setState({ loading: false })
    }
  }

  onSearchChange = (evt) => {
    this.setState({ searchValue: evt.target.value })
  }

  onValueSelect = (evt) => {
    this.setState({ selectedValue: evt.target.value })
  }

  applyFilter = async () => {
    const { selectedField, selectedValue, layer, jimuLayerView } = this.state

    if (!layer || !selectedField || !selectedValue) return

    const expression = `${selectedField} = '${selectedValue}'`
    
    try {
      // Apply filter using jimuLayerView if available
      if (jimuLayerView) {
        // Use jimuLayerView to apply filter
        await jimuLayerView.setDefinitionExpression(expression)
      } else {
        // Fallback to direct layer filtering
        layer.definitionExpression = expression
      }

      // Zoom to filtered features
      const queryResult = await layer.queryExtent({ where: expression })
      if (queryResult.extent) {
        this.state.jimuMapView.view.goTo(queryResult.extent.expand(1.2))
      }
    } catch (error) {
      console.error('Error applying filter:', error)
      // Fallback to direct layer filtering if jimuLayerView method fails
      layer.definitionExpression = expression
      
      // Still try to zoom
      try {
        const queryResult = await layer.queryExtent({ where: expression })
        if (queryResult.extent) {
          this.state.jimuMapView.view.goTo(queryResult.extent.expand(1.2))
        }
      } catch (zoomError) {
        console.error('Error zooming to filtered features:', zoomError)
      }
    }
  }

  clearFilter = async () => {
    const { layer, jimuLayerView } = this.state
    
    if (!layer) return

    try {
      // Clear filter using jimuLayerView if available
      if (jimuLayerView) {
        await jimuLayerView.setDefinitionExpression('')
      } else {
        // Fallback to direct layer filtering
        layer.definitionExpression = ''
      }
      
      this.setState({ selectedValue: '', searchValue: '' })
    } catch (error) {
      console.error('Error clearing filter:', error)
      // Fallback to direct layer filtering
      layer.definitionExpression = ''
      this.setState({ selectedValue: '', searchValue: '' })
    }
  }

  getFilteredValues = () => {
    const { uniqueValues, searchValue } = this.state
    if (!searchValue) return uniqueValues

    return uniqueValues.filter(value => 
      value.toString().toLowerCase().includes(searchValue.toLowerCase())
    )
  }

  getFieldOptions = () => {
    const { layer } = this.state
    const { config } = this.props
    
    if (!layer || !layer.fields) return []

    // Get allowed fields from config
    const allowedFields = config?.allowedFields || []
    
    // If no fields are configured, show all compatible fields (fallback)
    if (allowedFields.length === 0) {
      return layer.fields
        .filter(field => field.type === 'string' || field.type === 'small-integer' || field.type === 'integer' || field.type === 'double')
        .map(field => ({
          label: field.alias || field.name,
          value: field.name
        }))
    }

    // Filter fields based on configuration
    return layer.fields
      .filter(field => allowedFields.includes(field.name))
      .map(field => ({
        label: field.alias || field.name,
        value: field.name
      }))
  }

  render() {
    const { config, useMapWidgetIds } = this.props
    const { selectedField, searchValue, selectedValue, loading } = this.state

    if (!config?.layerId) {
      return (
        <div css={{
          padding: '20px',
          textAlign: 'center',
          color: '#666'
        }}>
          Please configure the widget by selecting a layer.
        </div>
      )
    }

    const fieldOptions = this.getFieldOptions()
    const filteredValues = this.getFilteredValues()

    return (
      <div css={{
        width: '100%',
        height: '100%',
        padding: '16px',
        backgroundColor: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <JimuMapViewComponent
          useMapWidgetId={useMapWidgetIds?.[0]}
          onActiveViewChange={this.onActiveViewChange}
        />

        <div>
          <label css={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            Select Field:
          </label>
          <Select
            value={selectedField}
            onChange={this.onFieldChange}
            placeholder="Choose a field..."
            style={{ width: '100%' }}
          >
            {fieldOptions.map(option => (
              <Option key={option.value} value={option.value}>
                {option.label}
              </Option>
            ))}
          </Select>
        </div>

        {selectedField && (
          <div>
            <label css={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Search Values:
            </label>
            <TextInput
              value={searchValue}
              onChange={this.onSearchChange}
              placeholder="Type to search..."
              style={{ width: '100%' }}
            />
          </div>
        )}

        {selectedField && !loading && (
          <div>
            <label css={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Select Value:
            </label>
            <Select
              value={selectedValue}
              onChange={this.onValueSelect}
              placeholder="Choose a value..."
              style={{ width: '100%' }}
              maxHeight={200}
            >
              {filteredValues.map((value, index) => (
                <Option key={index} value={value}>
                  {value}
                </Option>
              ))}
            </Select>
          </div>
        )}

        {loading && (
          <div css={{ textAlign: 'center', padding: '20px' }}>
            <Loading />
          </div>
        )}

        <div css={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
          <Button
            type="primary"
            onClick={this.applyFilter}
            disabled={!selectedField || !selectedValue}
            style={{ flex: 1 }}
          >
            Apply Filter
          </Button>
          <Button
            onClick={this.clearFilter}
            disabled={!selectedField}
            style={{ flex: 1 }}
          >
            Clear Filter
          </Button>
        </div>
      </div>
    )
  }
}