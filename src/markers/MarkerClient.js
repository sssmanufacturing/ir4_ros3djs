/**
 * @author Russell Toris - rctoris@wpi.edu
 */

/**
 * A marker client that listens to a given marker topic.
 *
 * Emits the following events:
 *
 *  * 'change' - there was an update or change in the marker
 *
 * @constructor
 * @param options - object with following keys:
 *
 *   * ros - the ROSLIB.Ros connection handle
 *   * topic - the marker topic to listen to
 *   * tfClient - the TF client handle to use
 *   * rootObject (optional) - the root object to add this marker to
 *   * path (optional) - the base path to any meshes that will be loaded
 *   * lifetime - the lifetime of marker
 */
ROS3D.MarkerClient = function(options) {
  options = options || {};
  this.ros = options.ros;
  this.topicName = options.topic;
  this.tfClient = options.tfClient;
  this.rootObject = options.rootObject || new THREE.Object3D();
  this.path = options.path || '/';
  this.lifetime = options.lifetime || 0;

  // Markers that are displayed (Map ns+id--Marker)
  this.markers = {};
  this.rosTopic = undefined;
  this.updatedTime = {};

  this.subscribe();
};
ROS3D.MarkerClient.prototype.__proto__ = EventEmitter2.prototype;

ROS3D.MarkerClient.prototype.unsubscribe = function(){
  if(this.rosTopic){
    this.rosTopic.unsubscribe();
  }
};

ROS3D.MarkerClient.prototype.checkTime = function(name){
    var curTime = new Date().getTime();
    if (curTime - this.updatedTime[name] > this.lifetime) {
        this.removeMarker(name);
        this.emit('change');
    } else {
        var that = this;
        setTimeout(function() {that.checkTime(name);},
                   100);
    }
};

ROS3D.MarkerClient.prototype.subscribe = function(){
  this.unsubscribe();

  // subscribe to the topic
  this.rosTopic = new ROSLIB.Topic({
    ros : this.ros,
    name : this.topicName,
    messageType : 'visualization_msgs/Marker',
    compression : '' //png
  });
  this.rosTopic.subscribe(this.processMessage.bind(this));
};

ROS3D.MarkerClient.prototype.processMessage = function(message){


  // remove old marker from Three.Object3D children buffer
  var oldNode = this.markers[message.ns + message.id];
  this.updatedTime[message.ns + message.id] = new Date().getTime();

  /* console.log('MarkerClient.processMessage: message.type=');
  console.log(message.type); */

  var updated = false;
  if (oldNode) {
    if (message.action === 0) {
      updated = this.markers[message.ns + message.id].children[0].update(message);
      if(!updated) { // "REMOVE"
        this.removeMarker(message.ns + message.id);
      }
    }
    else {
      this.removeMarker(message.ns + message.id);
    }
    

  } else if (this.lifetime) {
    this.checkTime(message.ns + message.id);
  }

  if (message.action === 0 && !updated) {  // "ADD" or "MODIFY"
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

  this.emit('change');
};

ROS3D.MarkerClient.prototype.removeMarker = function(key) {
  var oldNode = this.markers[key];
  if(!oldNode) {
    return;
  }
  oldNode.unsubscribeTf();
  this.rootObject.remove(oldNode);
  oldNode.children.forEach(child => {
    child.dispose();
    this.disposeObject(child);
    if(child.resource) {child.resource.dispose(); }
  });
  delete(this.markers[key]);
};

ROS3D.MarkerClient.prototype.isRenderItem = function (obj) {
  return 'geometry' in obj && 'material' in obj;
}

ROS3D.MarkerClient.prototype.disposeMaterial = function (obj) {
  if (!this.isRenderItem(obj)) {
    return;
  }

  // because obj.material can be a material or array of materials
  const materials = [].concat(obj.material);

  for (const material of materials) {
      material.dispose();
  }
}

ROS3D.MarkerClient.prototype.disposeObject = function (obj, removeFromParent = true, destroyGeometry = true, destroyMaterial = true) {
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
