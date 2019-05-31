/**
 * `preview-list`
 * 
 *  shows file items in a rearrangeable list
 *
 *
 *  properites:
 *
 *	
 *  	items - collection of file data objects that drives the template repeater
 *
 *		multiple - one (false) or many (true) preview items	  
 *	
 *
 *
 *  events:
 *
 *
 *    'list-item-dropped' - fired any time an item is dropped
 * 													detail: {data (x, y coordinates), target} 
 *
 * 		'list-sort-finished' - fired any time the list is sorted
 *
 *  
 *  methods:
 *
 *
 *    hideSortableElement(name) - name (file data name key)
 * 																returns the element newly hidden
 *
 *
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
import {
  isDisplayed, 
  schedule
}                 from '@spriteful/utils/utils.js';
import htmlString from './preview-list.html';
import '@spriteful/cms-icons/cms-icons.js';
import '@spriteful/drag-drop-list/drag-drop-list.js';
import '@spriteful/lazy-video/lazy-video.js';
import '@polymer/iron-icon/iron-icon.js';
import '@polymer/iron-image/iron-image.js';


class PreviewList extends SpritefulElement {
  static get is() { return 'preview-list'; }

  static get template() {
    return html([htmlString]);
  }


  static get properties() {
    return {

    	items: Array,
      // one file upload or multiple files
      multiple: {
        type: Boolean,
        value: false
      }

    };
  }


  __computeListClass(multiple) {
    return multiple ? '' : 'center-list';
  }


  __computeIronImageHidden(item) {
    if (!item || !item.type) { return true; }
    return !item.type.includes('image');
  }


  __computeIronIconHidden(item) {
    if (!item || !item.type) { return true; }
    return !item.type.includes('audio');
  }


  __computeLazyVideoHidden(item) {    
    if (!item || !item.type) { return true; }
    return !item.type.includes('video');
  }


  __computeImgSrc(item) {
    if (!item) { return '#'; }

    const {original, _tempUrl, thumbnail} = item;

    if (thumbnail) { return thumbnail; }
    if (original)  { return original; }
    return _tempUrl;
  }


  __computeVideoSrc(item) {
    if (!item) { return '#'; }

    const {original, _tempUrl} = item;

    if (original) { return original; }
    return _tempUrl;
  }

  // iron-image on-loaded-changed
  async __handleImageLoadedChanged(event) {
    const {detail, model} = event;
    if (!model.item) { return; }
    const {value: loaded}      = detail;
    const {original, _tempUrl} = model.item;

    if (loaded && _tempUrl && !original) {
      await schedule(); // iron-image workaround
      window.URL.revokeObjectURL(_tempUrl);
    }
  }

  // lazy-video metadata-loaded event handler
  __handleMetadataLoaded(event) {
    const {original, _tempUrl} = event.model.item;
    if (_tempUrl && !original) {
      window.URL.revokeObjectURL(_tempUrl);
    }
  }


  __handleDrop(event) {
  	this.fire('list-item-dropped', event.detail);
  }


  __handleSort() {
    this.fire('list-sort-finished');
  }

  // fake deleting the element to play nicely with drag-drop-list
  hideSortableElement(name) {
    const elements = this.selectAll('.sortable');
    const element  = elements.find(element => 
      element.item && element.item.name === name);
    if (!element) { return; }
    element.classList.remove('sortable');
    element.style.display = 'none';
    return element;
  }


  getListItems() {
  	return this.selectAll('.sortable').
             filter(el => isDisplayed(el)).
             map(el => el.item);
  }

}

window.customElements.define(PreviewList.is, PreviewList);
