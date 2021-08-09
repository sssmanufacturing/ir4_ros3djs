/**
 * @author Russell Toris - rctoris@wpi.edu
 * @author Nils Berg - berg.nils@gmail.com
 */

/**
 * A MarkerArray client that listens to a given topic.
 *
 * Emits the following events:
 *
 *  * 'change' - there was an update or change in the MarkerArray
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic - the marker topic to listen to
 *   * tfClient - the TF client handle to use
 *   * rootObject (optional) - the root object to add the markers to
 *   * path (optional) - the base path to any meshes that will be loaded
 */
ROS3D.MarkerArrayClient = function(options) {
  options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic;
  this.tfClient = options.tfClient;
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.path = options.path || '/';
  this.hiddenTypes = options.hiddenTypes || [];

  // Markers that are displayed (Map ns+id--Marker)
  this.markers = {};
  this.rosTopic = undefined;

  this.subscribe();
};
ROS3D.MarkerArrayClient.prototype.__proto__ = EventEmitter2.prototype;

ROS3D.MarkerArrayClient.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to MarkerArray topic
  this.rosTopic = new ROSLIB.Topic({
    ros : this.ros,
    name : this.topicName,
    messageType : 'visualization_msgs/MarkerArray',
    compression : '' //png
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.MarkerArrayClient.prototype.processMessage = function(arrayMessage){
  arrayMessage.markers.forEach(function(message) {

    //console.log('MarkerArrayClient.processMessage: message.type=');
    //console.log(message.type);
  

    if(message.action === 0) {
      if(!this.hiddenTypes.includes(message.type)) {
        var updated = false;
        if(message.ns + message.id in this.markers) { // "MODIFY"
          updated = this.markers[message.ns + message.id].children[0].update(message);
          if(!updated) { // "REMOVE"
            this.removeMarker(message.ns + message.id);
          }
        }
        if(!updated) { // "ADD"
          var newMarker = new ROS3D.Marker({
            message : message,
            path : this.path,
          });
          this.markers[message.ns + message.id] = new ROS3D.SceneNode({
            frameID : message.header.frame_id,
            tfClient : this.tfClient,
            object : newMarker
          });
          this.rootObject.add(this.markers[message.ns + message.id]);
        }
      }
      
    }
    else if(message.action === 1) { // "DEPRECATED"
      console.warn('Received marker message with deprecated action identifier "1"');
    }
    else if(message.action === 2) { // "DELETE"
      this.removeMarker(message.ns + message.id);
    }
    else if(message.action === 3) { // "DELETE ALL"
      for (var m in this.markers){
        this.removeMarker(m);
      }
      this.markers = {};
    }
    else {
      console.warn('Received marker message with unknown action identifier "'+message.action+'"');
    }
  }.bind(this));

  this.emit('change');
};

ROS3D.MarkerArrayClient.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.MarkerArrayClient.prototype.removeMarker = function(key) {
  var oldNode = this.markers[key];
  if(!oldNode) {
    return;
  }

  oldNode.unsubscribeTf();
  this.rootObject.remove(oldNode);
  oldNode.children.forEach(child => {
   
    child.dispose();
    this.disposeObject(child);
    /* child.material.dispose();
    child.geometry.dipose(); */
    if(child.resource) {child.resource.dispose(); }
    
  });

  delete(this.markers[key]);

  oldNode = {};
};

ROS3D.MarkerArrayClient.prototype.isRenderItem = function (obj) {
  return 'geometry' in obj && 'material' in obj;
}

ROS3D.MarkerArrayClient.prototype.disposeMaterial = function (obj) {
  if (!this.isRenderItem(obj)) {
    return;
  }

  // because obj.material can be a material or array of materials
  const materials = [].concat(obj.material);

  for (const material of materials) {
      material.dispose();
  }
}

ROS3D.MarkerArrayClient.prototype.disposeObject = function (obj, removeFromParent = true, destroyGeometry = true, destroyMaterial = true) {
  if (!obj) {
    return;
  } 
  if (this.isRenderItem(obj)) {
      if (obj.geometry && destroyGeometry) { obj.geometry.dispose();}
      if (destroyMaterial) { this.disposeMaterial(obj); }
  }

 /*  removeFromParent &&
      Promise.resolve().then(() => {
          // if we remove children in the same tick then we can't continue traversing,
          // so we defer to the next microtask
          obj.parent && obj.parent.remove(obj)
      }) */
}

ROS3D.MarkerArrayClient.prototype.removeArray = function() {
  this.rosTopic.unsubscribe();
  for (var key in this.markers) {
    if (this.markers.hasOwnProperty(key)) {
      this.markers[key].unsubscribeTf();
      this.markers[key].children[0].dispose();
      this.rootObject.remove( this.markers[key] );
    }
  }
  this.markers = {};
};