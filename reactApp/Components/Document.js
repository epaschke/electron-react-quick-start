var React = require('react');
var { Editor, EditorState, RichUtils, convertFromRaw, convertToRaw, SelectionState, Modifier } = require('draft-js');
var { Link } = require('react-router-dom');
const { styleMap } = require('../styleMap');
console.log('styleMap: ', styleMap);
var axios = require('axios');

class DocContainer extends React.Component {
  constructor(props){
    super(props);
    console.log('props: ', this.props.match);
    const id = this.props.match.params.docId;
    this.state = {
      id: id,
      loading: true,
      title: '',
      editorState: EditorState.createEmpty(),
      currentSelection: SelectionState.createEmpty(),
      socket: io.connect('http://localhost:3000', { transports: ['websocket'] })
    };

    this.state.socket.on('connect', () => {
      console.log('connected');
      this.state.socket.emit('join', this.state.id);
    });

    axios.get('http://localhost:3000/document/' + this.state.id)
    .then(function (response) {
      console.log('got response: ', response.data);
      this.setState({
        title: response.data.title,
        editorState: response.data.editorRaw ? EditorState.createWithContent(convertFromRaw(JSON.parse(response.data.editorRaw))) : this.state.editorState,
        currentSelection: response.data.editorRaw ? EditorState.createWithContent(convertFromRaw(JSON.parse(response.data.editorRaw))).getSelection() : this.state.currentSelection,
        loading: false
      });
    }.bind(this))
    .catch(function (error) {
      console.log(error);
    });

    this.onChange = (editorState) => {
      this.state.socket.emit('typing', JSON.stringify(convertToRaw(editorState.getCurrentContent())));
      this.state.socket.emit('selection', {
        anchorOffset: editorState.getSelection().getAnchorOffset(),
        focusOffset: editorState.getSelection().getFocusOffset(),
        anchorKey: editorState.getSelection().getAnchorKey(),
        focusKey: editorState.getSelection().getFocusKey(),
        isCollapsed: editorState.getSelection().isCollapsed(),
        isBackward: editorState.getSelection().getIsBackward()
      });
      this.setState({editorState, currentSelection: editorState.getSelection()});
    };
  }

  setStateFn(toSet){
    this.setState({
      editorState: toSet
    })
  }

  componentWillMount(){
    this.state.socket.on('changestate', (newState) => {
      this.setState({
        editorState: EditorState.forceSelection(EditorState.createWithContent(convertFromRaw(JSON.parse(newState))), this.state.currentSelection)
      });
    });
  }

  save(){
    axios.post('http://localhost:3000/save',
    { docId: this.state.id, title: this.state.title, editorState: JSON.stringify(convertToRaw(this.state.editorState.getCurrentContent())) })
    .then(function(response){
      console.log('got response from save: ', response);
      if (response.data.success){
        console.log('saved');
      } else {
        console.log('error saving');
      }
    })
    .catch(function(error){
      console.log(error);
    })
  }

  leaveDoc(){
    this.state.socket.emit('leave');
  }
  render(){
    return (
            <div>
                <Static loading={this.state.loading} docId={this.state.id} title={this.state.title} leaveDoc={this.leaveDoc.bind(this)} saveFn={this.save.bind(this)} />
                <MyEditor docId={this.state.id} currentSelection={this.state.currentSelection} editorState={this.state.editorState} onChangeFn={this.onChange} socket={this.state.socket} setStateFn={this.setStateFn.bind(this)}/>            </div>
    );
  }
 }

class Static extends React.Component {
  render(){
    return (
            <div style={{display: "flex", justifyContent: 'space-around', alignItems: 'center'}}>
                <Link onClick={this.props.leaveDoc} to="/home" className="btn-floating btn-large waves-effect waves-light red">
                  <i className="material-icons">keyboard_return</i>
                </Link>
                <div><h3>{!this.props.loading && <b>{this.props.title}</b>}</h3>
                <p>ID: {this.props.docId}</p></div>
                <a className="btn-floating btn-large waves-effect waves-light blue"
                   onClick={this.props.saveFn}>
                  <i className="material-icons">save</i>
                </a>
            </div>
    );
  }
}

class MyEditor extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      size: 12,
      location: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        height: 0,
        width: 0,
      },
      color: 'white',
      display: false
    };
  }

  componentDidMount(){
    this.props.socket.on('aftercolor', (obj) => {
      var selectionState = SelectionState.createEmpty();
      selectionState = selectionState.merge({
        anchorOffset: obj.anchorOffset,
        focusOffset: obj.focusOffset,
        focusKey: obj.focusKey,
        anchorKey: obj.anchorKey,
        isBackward: obj.isBackward
      });
      var originalSelection = this.props.currentSelection;
      this.props.setStateFn(EditorState.forceSelection(this.props.editorState, selectionState));
      var coords = window.getSelection().getRangeAt(0).getBoundingClientRect();
      this.props.setStateFn(EditorState.forceSelection(this.props.editorState, originalSelection));
      if (obj.isCollapsed){
        this.setState({
          location: {
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            right: coords.right,
            height: coords.height,
            width: coords.height/16
          },
          color: obj.color,
          display: true
        });
      } else {
        this.setState({
          location: {
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            right: coords.right,
            height: coords.height,
            width: coords.width
          },
          color: obj.color,
          display: true
        });
      }

    });
  }

  _onColorSelect(){
    var color = document.getElementById('colorSelect').value;
    var colorArr = color.split('');
    colorArr[0] = colorArr[0].toUpperCase();
    color = colorArr.join('');
    this._onToggleInline(`text${color}`);
  }

  _onBackgroundColorSelect(){
    var color = document.getElementById('backgroundColorSelect').value;
    var colorArr = color.split('');
    colorArr[0] = colorArr[0].toUpperCase();
    color = colorArr.join('');
    this._onToggleInline(`background${color}`);
  }

  _onToggleInline(type){
    this.props.onChangeFn(RichUtils.toggleInlineStyle(this.props.editorState, type));
  }

  _onFont(){
    var font = document.getElementById('fontStyleSelect').value;
    console.log('font: ', font);
    this.props.onChangeFn(RichUtils.toggleInlineStyle(this.props.editorState, font));
  }

  _onSizeSelect(){
    let size = document.getElementById('slider1').value;
    this.setState({
      size
    });
    this._onToggleInline(`fontSize${this.state.size}`).bind(this);
  }

  _onToggleBlock(type){
    this.props.onChangeFn(RichUtils.toggleBlockType(this.props.editorState,type));
  }

  myBlockStyleFn(contentBlock) {
    const type = contentBlock.getType();
    switch (type) {
    case 'leftAlign':
      return 'leftAlign';
    case 'rightAlign':
      return 'rightAlign';
    case 'centerAlign':
      return 'centerAlign';
    default:
      return 'leftAlign';
    }
  }

  render() {
    return (
        <div>
            <div>
                <div style={{display: 'flex'}}>
                  <div style={{flex: 1}}>
                    <input id="slider1" type="range" min="12" max="108" step="12" defaultValue="12" onChange={this._onSizeSelect.bind(this)}/>
                    <div style={{width: 80}}>
                      Size: {this.state.size}
                    </div>
                  </div>
                 <select id='fontStyleSelect' className='dropdown-button btn' href='#' style={{margin: 5}} onChange={this._onFont.bind(this)}>
                   <option>-font-</option>
                   <option value="cambria">Cambria</option>
                   <option value="monospace">Monospace</option>
                   <option value="times new roman">Times New Roman</option>
                </select>

               <select id='colorSelect' className='dropdown-button btn' href='#' style={{margin: 5}} onChange={this._onColorSelect.bind(this)}>
                 <option>-color-</option>
                 <option value="red">red</option>
                 <option value="blue">blue</option>
                 <option value="green">green</option>
                 <option value="yellow">yellow</option>
              </select>

              <select id='backgroundColorSelect' className='dropdown-button btn' href='#' style={{margin: 5}} onChange={this._onBackgroundColorSelect.bind(this)}>
                <option>-background-</option>
                <option value="red">red</option>
                <option value="blue">blue</option>
                <option value="green">green</option>
                <option value="yellow">yellow</option>
             </select>
             </div>
             <div style={{display: 'flex', justifyContent: 'space-around'}}>
                 <a className="waves-effect waves-teal btn-flat" onClick={() => this._onToggleInline('BOLD')}><i className="material-icons">format_bold</i></a>
                 <a className="waves-effect waves-teal btn-flat" onClick={() => this._onToggleInline('ITALIC')}><i className="material-icons">format_italic</i></a>
                 <a className="waves-effect waves-teal btn-flat" onClick={() => this._onToggleInline('UNDERLINE')}><i className="material-icons">format_underlined</i></a>
                 <a className="waves-effect waves-teal btn-flat" onClick={() => this._onToggleBlock('leftAlign')}><i className="material-icons">format_align_left</i></a>
                 <a className="waves-effect waves-teal btn-flat" onClick={() => this._onToggleBlock('centerAlign')}><i className="material-icons">format_align_center</i></a>
                 <a className="waves-effect waves-teal btn-flat" onClick={() => this._onToggleBlock('rightAlign')}><i className="material-icons">format_align_right</i></a>
                 <a className="waves-effect waves-teal btn-flat"><i className="material-icons" onClick={() => this._onToggleBlock('unordered-list-item')}>format_list_bulleted</i></a>
                 <a className="waves-effect waves-teal btn-flat"><i className="material-icons" onClick={() => this._onToggleBlock('ordered-list-item')}>format_list_numbered</i></a>
                 <a className="waves-effect waves-teal btn-flat" onClick={() => this._onToggleInline('STRIKETHROUGH')}><i className="material-icons">format_strikethrough</i></a>
             </div>
         </div>

         {this.state.display ?
           <div style={{
             zIndex: -1,
             backgroundColor: this.state.color,
             position: 'absolute', top: this.state.location.top,
             right: this.state.location.right,
             width: this.state.location.width,
             height: this.state.location.height,
             left: this.state.location.left,
             bottom: this.state.location.bottom }}/>
             : null}
          <div style={{ border: "1px solid gray", minHeight: 300, margin: 20 }}>
              <Editor spellCheck={true}
                blockStyleFn={this.myBlockStyleFn}
                customStyleMap={styleMap}
                editorState={this.props.editorState}
                handleKeyCommand={this.handleKeyCommand}
                onChange={this.props.onChangeFn}/>
          </div>
          <div style={{display: "flex", alignItems: 'center'}}>
              <Link className="btn-flat blue" to={`/history/${this.props.docId}`}> View History</Link>
            </div>
        </div>
    );
  }
}

module.exports = { DocContainer };
