
/**
 * `upload-list`
 * 
 *
 * @customElement
 * @polymer
 * @demo demo/index.html
 */
import {
  SpritefulElement, 
  html
}                 from '@spriteful/spriteful-element/spriteful-element.js';
import htmlString from './upload-list.html';
import './file-item.js';


class SpritefulUploadList extends SpritefulElement {
  static get is() { return 'upload-list'; }

  static get template() {
    return html([htmlString]);
  }


  static get properties() {
    return {
      // the firebase storage file directory ie. 'images/home_carousel'
      directory: String,
      // firestore document field to use for saving file data after processing
      // ie. 'backgroundImg', 'catImages', ...
      field: {
        type: String,
        value: 'images'
      },
      // drag-drop-files items prop
      files: Array,

      _metadata: {
        type: Object,
        computed: '__computeMetadata(field)'
      }

    };
  }


  __computeMetadata(field) {
    // metadata.customMetadata in client sdk, metadata.metadata in cloud functions
    return {customMetadata: {field}}; 
  }


  __preventDefaults(event) {
    event.preventDefault();
    event.stopPropagation();
  }


  async __fileItemClicked() {
    try {
      await this.clicked();
      this.fire('upload-list-file-item-clicked');
    }
    catch (error) { 
      if (error === 'click debounced') { return; }
      console.error(error); 
    }
  }


  // __itemAnimationEnd(event) {
  //   if (typeof this._indexToDelete !== 'number') { return; }
  //   this.__deleteFile(this._indexToDelete);
  //   this._indexToDelete = undefined;
  // }


  // __fileUploadComplete(event) {
  //   const {index}        = event.detail;
  //   const items          = this.selectAll('.item');
  //   const remainingItems = items.slice(index + 1);

  //   if (remainingItems.length) {
  //     this._indexToDelete = index;
  //     remainingItems.forEach(item => {
  //       item.classList.add('slide-up');
  //     });
  //   } else {
  //     this.__deleteFile(index);
  //   }
  // }

  // TODO:
  //      animate the remaining items up before delete
  //      take care to make sure items to delete are queued properly
  //      since they may finish uploading before animation is finished


  // event handler from file-item
  __fileUploadComplete(event) {
    const {name} = event.detail;
    const index  = this.files.findIndex(obj => {
      if (!obj.file || !obj.file.newName) { return false; }
      return obj.file.newName === name;
    });
    this.fire('upload-list-upload-complete', {...event.detail, index});
  }


  // file-item ui x button clicked
  __removeFile(event) {
    this.__preventDefaults(event);
    this.fire('upload-list-remove-file-by-index', event.detail);
  }


  hideUploadItem(index) {
    const element = this.selectAll('.item')[index];
    if (!element) { return; }
    element.cancelUpload();
    element.classList.remove('displayed');
  }


  reset() {
    const elements = this.selectAll('.item');
    elements.forEach(element => {
      element.cancelUpload();
    });
  }

}

window.customElements.define(SpritefulUploadList.is, SpritefulUploadList);
