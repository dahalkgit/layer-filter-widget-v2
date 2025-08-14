/** @jsx jsx */
import { React, jsx, AllWidgetProps, DataSourceManager, QueriableDataSource } from 'jimu-core'
import { JimuMapViewComponent, JimuMapView } from 'jimu-arcgis'
import { Select, Option, TextInput, Button, Loading } from 'jimu-ui'
import { IMConfig } from '../config'

interface State {
  jimuMapView: JimuMapView
  selectedField: string
  searchValue: string
  uniqueValues: string[]
  selectedValue: string
  loading: boolean
  layer: any
  jimuLayerView: any
}

export default class Widget extends React.PureComponent<AllWidgetProps<IMConfig>, State> {
  private _layerView?: __esri.FeatureLayerView

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
      const jimuLayerViews = jimuMapView.jimuLayerViews
      let targetJimuLayerView: any = null

      for (const [, jlv] of Object.entries(jimuLayerViews)) {
        if ((jlv as any).layerDataSourceId === config.layerId) {
          targetJimuLayerView = jlv
          break
        }
      }

      if (targetJimuLayerView) {
        const layerDataSource = await targetJimuLayerView.createLayerDataSource()
        const layer = (layerDataSource as any)?.layer
        const layerView = await targetJimuLayerView.getLayerView()
        this._layerView = layerView as __esri.FeatureLayerView
        this.setState({ layer, jimuLayerView: targetJimuLayerView })
        return
      }

      // Fallback: search by map layer id
      const layer = jimuMapView.view.map.findLayerById(config.layerId) as __esri.FeatureLayer
      if (layer) {
        const layerView = await jimuMapView.view.whenLayerView(layer)
        this._layerView = layerView as __esri.FeatureLayerView
        this.setState({ layer, jimuLayerView: null })
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
      // Helps some services when using distinct
      query.orderByFields = [fieldName]

      const result = await this.state.layer.queryFeatures(query)
      const values = result.features
        .map(feature => feature.attributes[fieldName])
        .filter(value => value != null && value !== '')
        .sort((a, b) => String(a).localeCompare(String(b)))

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
    const { selectedField, selectedValue } = this.state
    const layer: any = this.state.layer
    const layerView = this._layerView

    if (!layer || !selectedField || !selectedValue) return

    // Escape single quotes in value
    const expression = `${selectedField} = '${String(selectedValue).replace(/'/g, "''")}'`

    try {
      // 1) Prefer LayerView filter (per-view, fast)
      if (layerView && 'filter' in layerView) {
        ;(layerView as any).filter = { where: expression }
      }
      // 2) Fallback: mutate layer definition
      else if ('definitionExpression' in layer) {
        layer.definitionExpression = expression
      }
      // 3) Last resort: push query to the data source (keeps ExB data flow consistent)
      else {
        const ds = DataSourceManager.getInstance().getDataSource(this.props.config.layerId) as QueriableDataSource
        if (ds?.updateQueryParams) {
          ds.updateQueryParams({ where: expression }, this.props.id)
        }
      }

      // Zoom to filtered features
      if (layer?.queryExtent) {
        const { extent } = await layer.queryExtent({ where: expression })
        if (extent) await this.state.jimuMapView.view.goTo(extent.expand(1.2))
      }
    } catch (error) {
      console.error('Error applying filter:', error)
    }
  }

  clearFilter = async () => {
    const layer: any = this.state.layer
    const layerView = this._layerView

    try {
      if (layerView && 'filter' in layerView) {
        ;(layerView as any).filter = null
      }
      if ('definitionExpression' in layer) {
        layer.definitionExpression = ''
      }
      const ds = DataSourceManager.getInstance().getDataSource(this.props.config.layerId) as QueriableDataSource
      if (ds?.updateQueryParams) {
        ds.updateQueryParams({ where: '' }, this.props.id)
      }

      this.setState({ selectedValue: '', searchValue: '' })
    } catch (error) {
      console.error('Error clearing filter:', error)
    }
  }

  getFilteredValues = () => {
    const { uniqueValues, searchValue } = this.state
    if (!searchValue) return uniqueValues
    return uniqueValues.filter(value =>
      value != null && String(value).toLowerCase().includes(searchValue.toLowerCase())
    )
  }

  getFieldOptions = () => {
    const { layer } = this.state
    const { config } = this.props
    if (!layer || !layer.fields) return []

    const allowedFields = config?.allowedFields || []

    const allowedEsri = new Set([
      'esriFieldTypeString',
      'esriFieldTypeSmallInteger',
      'esriFieldTypeInteger',
      'esriFieldTypeDouble'
    ])
    const allowedJimu = new Set([
      'string', 'String',
      'small-integer', 'SmallInteger',
      'integer', 'Integer',
      'double', 'Double',
      'number', 'Number', 'single', 'Single'
    ])

    const isCompatible = (t?: string) => {
      const type = (t ?? '').toString()
      return allowedEsri.has(type) || allowedJimu.has(type)
    }

    const base = layer.fields.filter(f => isCompatible(f.type))

    if (allowedFields.length === 0) {
      return base.map(f => ({ label: f.alias || f.name, value: f.name }))
    }

    return base
      .filter(f => allowedFields.includes(f.name))
      .map(f => ({ label: f.alias || f.name, value: f.name }))
  }

  render() {
    const { config, useMapWidgetIds } = this.props
    const { selectedField, searchValue, selectedValue, loading } = this.state

    if (!config?.layerId) {
      return (
        <div css={{ padding: '20px', textAlign: 'center', color: '#666' }}>
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
                  {String(value)}
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
