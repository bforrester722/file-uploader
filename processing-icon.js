/**
 * `processing-icon`
 * 
 *  animated icon that helps illustrate that the file is being processed
 *
 *
 *  properites:
 *
 *  
 *    item - file data object that drives animation timing
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
	schedule,
	wait
}     						from '@spriteful/utils/utils.js';
import htmlString from './processing-icon.html';


class SpritefulProcessingIcon extends SpritefulElement {
  static get is() { return 'processing-icon'; }

  static get template() {
    return html([htmlString]);
  }


  static get properties() {
    return {

      item: Object,

      _animate: {
      	type: Boolean,
      	value: false,
      	computed: '__computeAnimate(item)'
      },

      _ids: {
      	type: Array,
      	value: [
      		'box1',
      		'box4',
      		'box1',
      		'box4',
      		'box2',
      		'box3',      		
      		'box2',
      		'box3'
      	]
      }

    };
  }


  static get observers() {
  	return [
  		'__animateChanged(_animate)'
  	];
  }

  // animate from upload through final processing
  __computeAnimate(item) {
  	if (!item || 'type' in item === false) { return false; }
  	// animate during image processing as well
  	if (item.type.includes('image')) {
  		return 'optimized' in item === false;
  	}
  	// Other file types don't have futher processing
  	// so we are done animating.	
  	return 'original' in item === false;
  }


  async __animateChanged(animate) {
  	if (animate) {
  		this.style.display = 'block';
  		await schedule();
  		this.__startAnimation();
  	}
  	else {
  		this.style.display = 'none';
  	}
  }


  async __startAnimation() {

  	let index = 0;
  	const iterations = this._ids.length - 1;

  	while (this._animate) {
  		if (index > iterations) {
  			index = 0;
  		}
  		const id  = this._ids[index];
  		const box = this.$[id];
  		if (box.classList.contains('rotate')) {
  			box.classList.remove('rotate');
  		}
  		else {  			
  			box.classList.add('rotate');
  		}
  		await wait(1200);
  		index += 1;
  	}
  }

}

window.customElements.define(SpritefulProcessingIcon.is, SpritefulProcessingIcon);
