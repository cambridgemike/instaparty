var getParameterByName = function(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
};

var preloadImages = function(images) {
    for(var i=0; i < images.length; i++){
        var imageObj = new Image();
        imageObj.src = images[i].replace(/^http:/, "https:");
    }
};

var preloadVideos = function(videos) {
    for(var i=0; i < videos.length; ) {
            var video = new Video();
            video.src = videos[i];
        }
};

var CLIENT_ID = window.location.hash.substr(1),
    INSTAGRAM_URL = 'https://api.instagram.com/v1/',
    SLIDE_CONTAINER = 'slideContainer';


// Instagram module
var InstagramUser = function(user_id) {
    this.id = user_id;
    this.images = [];
    this.videos = [];
};

InstagramUser.findByUsername = function(username, callback) {
    var url = INSTAGRAM_URL + 'users/search?client_id=' + CLIENT_ID + "&q=" + username;
    $.getJSON(url + '&callback=?', function(resp) {
        var userList = resp.data;
        if(!userList || userList.length == 0) { 
            callback(false);
        } else {
            var user = new InstagramUser(userList[0].id);
            callback(user, userList[0]);
        }
    });
};

InstagramUser.prototype.getRecentMedia = function(_url) {
    if(!_url) {
        _url = INSTAGRAM_URL + 'users/' + this.id + '/media/recent/?count=500&client_id=' + CLIENT_ID;
        this.mediaDeferred = $.Deferred();
    }

    var user = this;

    $.getJSON(_url + '&callback=?', function(resp){
        // Update media
        var images = _.map(resp.data, function(post) { if(post.images) return post.images.standard_resolution.url; }),
                videos = _.map(resp.data, function(post) { if(post.videos) return post.videos.standard_resolution.url; });

        user.images = user.images.concat(images);
        user.videos = user.videos.concat(videos);

        // Go to next page or resolve
        if(resp.pagination && resp.pagination.next_url) {
            user.getRecentMedia(resp.pagination.next_url);
        } else {
            user.mediaDeferred.resolveWith(user, [user]);
        }
    });

    return this.mediaDeferred;
};

// Form controller

$(document).ready(function() {
    var $userSearch = $("#inputUsername"),
            updateDeferreds = [];
    $("form#addUser").submit(function(e){
        var username = $userSearch.val();

        InstagramUser.findByUsername(username, function(user, userData) {
            if(user){
                $userSearch.parents('.form-group').removeClass('has-error');
                $userSearch.val("");

                // Add the user to the UserList
                $user = _.template($("#user_template").text(), userData);
                $("#userList").append($user);

                // Add their images to the slideshow
                $("#spinner").show();
                var deferred = user.getRecentMedia()
                    .done(function(user){
                        $("#spinner").hide();
                        slideShow.mediaList.addUser(user);
                    });
                updateDeferreds.push(deferred);
            } else {
                $userSearch.parents('.form-group').addClass('has-error');
            }
        });
        e.preventDefault();
    });

    $(document).on('click', ".user .close", function(e) {
        var userToRemove = $(this).data('user-id'),
                userID = parseInt(userToRemove);

        slideShow.mediaList.removeUser(userID);
        $(this).parents('.user').remove();
    });

    $(".modal")
        .modal({show: false})
        .on('show.bs.modal', function() { 
            slideShow.pause();
            $("#inputUsername").focus();
        })
        .on('hidden.bs.modal', function() {
            // Don't restart if we're still waiting to get media
            $.when.apply(null,updateDeferreds)
                        .done(function(){
                            slideShow.restart();
                        });
        });

    $("body").on('keyup', function(e) {
        if(e.keyCode == 85) {
            $(".modal").modal('show');
        }
    });
});



var MediaList = function() {
    // Dictionaries of users to media
    this.media = {};

    // used by slideshow
    this.images = [];
    this.videos = [];
    this.imageIndex = 0;
    this.videoIndex = 0;
};

MediaList.prototype.reset = function() {
    this.imageIndex = 0;
    this.videoIndex = 0;
    this.images = _(this.media).values().pluck('images').flatten().compact().shuffle().value();
    this.videos = _(this.media).values().pluck('videos').flatten().compact().shuffle().value();
};

MediaList.prototype.addUser = function(user) {
    this.media[user.id] = {images: user.images, videos: user.videos};
    this.reset();
};

MediaList.prototype.removeUser = function(user_id) {
    delete this.media[user_id];
    this.reset();
};

MediaList.prototype.getImages = function(image_count) {
    if(this.imageIndex + image_count > this.images.length) {
        this.reset();
    }

    var images = this.images.slice(this.imageIndex, this.imageIndex + image_count);
    this.imageIndex += image_count;

    // Preload the next batch
    preloadImages(this.images.slice(this.imageIndex, this.imageIndex + 4));
    return images;
}

var Layouts = {
    layouts: {
        1: ["one"],
        2: ["two"],
        3: ["three", "three-a"],
        4: ["four", "four-a"]
    },

    forCount: function(count) {
        return _.sample(this.layouts[count]);
    }
};


var SlideController = function(images) {
    var layout = Layouts.forCount(images.length),
            self = this;

    this.$container = $("<div></div>") 
        .addClass(SLIDE_CONTAINER)
        .addClass(layout);

    _.each(images, function(image) {
        var $div = $("<div></div>");
        iamge = image.replace(/^http:/, "https:");
        $div.css('background-image', 'url(' + image + ')');
        self.$container.append($div);
    });
};

SlideController.prototype.animate = function(animation, callback) {
    this.$container.find("> div")
        .addClass('animated')
        .addClass(animation);

    this.$container.one('webkitAnimationEnd animationend', callback);
};

SlideController.prototype.render = function(images) {
    $("body").append(this.$container);
    this.animate('fadeInDown', _.noop);
};

SlideController.prototype.remove = function(callback) {
    var self = this;
    this.animate('fadeOutDown', function() {
        self.$container.remove();
        callback();
    });
};



var SlideShowController = function() {
    this.mediaList = new MediaList();
    this.interval = getParameterByName('interval') || 10000;
    this.interval = parseInt(this.interval);
    this.loopID = null;
};

SlideShowController.prototype.play = function() {
    var self = this;
    window.clearTimeout(this.playTimeout);
    // Delay start by 1 second to allow time for preload;
    this.playTimeout = setTimeout(function() {
        self.nextSlide();
        self.loopID = setInterval(function(){ self.nextSlide() }, self.interval);
    }, 2000);
};

SlideShowController.prototype.pause = function() {
    window.clearInterval(this.loopID);
};

SlideShowController.prototype.restart = function() {
    this.pause();
    this.mediaList.reset();
    preloadImages(this.mediaList.images.slice(0, 10));
    this.play();
};

SlideShowController.prototype.nextSlide = function() {
    var imageCount = _.random(1,4),
            self = this;
    console.log(this.imageIndex);

    var addNewSlide = function(imageCount) {
        return function(){
            var images = self.mediaList.getImages(imageCount);
            var slideController = new SlideController(images);
            slideController.render();
            self.prevSlide = slideController;
        };
    }(imageCount);

    if(this.prevSlide)
        this.prevSlide.remove(addNewSlide);
    else
        addNewSlide();
};

SlideShowController.prototype.remove = function() {
    this.pause();
    $(SLIDE_CONTAINER).remove();
};


// Global variable
var slideShow = new SlideShowController();

var getAllMedia = function(user_ids, callback){
    var deferreds = _.map(user_ids, function(user_id) {
        var instagramUser = new InstagramUser(user_id);
        return instagramUser.getRecentMedia();
    });

    // After we get recent media for everyone, callback
    $.when.apply(null, deferreds)
        .done(function(){
            callback(arguments);
        });
};

var getMediaAndPlay = function(user_ids) {
    $("#spinner").show();
    getAllMedia(user_ids, function(users) {

        _.each(users, function(user){
            slideShow.mediaList.addUser(user);
        });

        slideShow.restart();
        $("#spinner").hide();
    });
};


// Functions for the iOS app bridge
var addUserByID = function(user_id) {
    var user = new InstagramUser(user_id);
    user.getRecentMedia()
        .done(function(user){
            slideShow.mediaList.addUser(user);
            slideShow.restart();
        });
};

var removeUserByID = function(user_id) {
    slideShow.mediaList.removeUser(user_id);
    slideShow.restart();
};

var setClientID = function(client_id) {
    CLIENT_ID = client_id;
}

// Kick it off!!
$(function(){
    var users = getParameterByName('users').split(','),
            user_ids = _.compact(users);

    if(user_ids && user_ids.length > 0) {
        getMediaAndPlay(user_ids);
    }
});




// Chromecast
window.onload = function() {
    cast.receiver.logger.setLevelValue(0);
    window.castReceiverManager = cast.receiver.CastReceiverManager.getInstance();
    console.log('Starting Receiver Manager');
    
    // handler for the 'ready' event
    castReceiverManager.onReady = function(event) {
      console.log('Received Ready event: ' + JSON.stringify(event.data));
      window.castReceiverManager.setApplicationState("Application status is ready...");
    };
    
    // handler for 'senderconnected' event
    castReceiverManager.onSenderConnected = function(event) {
      console.log('Received Sender Connected event: ' + event.data);
      console.log(window.castReceiverManager.getSender(event.data).userAgent);
    };
    
    // handler for 'senderdisconnected' event
    castReceiverManager.onSenderDisconnected = function(event) {
      // console.log('Received Sender Disconnected event: ' + event.data);
      // if (window.castReceiverManager.getSenders().length == 0) {
      //       window.close();
      //     }
    };

    // handler for 'systemvolumechanged' event
    castReceiverManager.onSystemVolumeChanged = function(event) {
      console.log('Received System Volume Changed event: ' + event.data['level'] + ' ' +
          event.data['muted']);
    };


    // create a CastMessageBus to handle messages for a custom namespace
    window.messageBus =
      window.castReceiverManager.getCastMessageBus(
          'urn:x-cast:com.google.cast.mike.instaparty');

    // handler for the CastMessageBus message event
    window.messageBus.onMessage = function(event) {
      console.log('Message [' + event.senderId + ']: ' + event.data);
      // display the message from the sender
      var payload = JSON.parse(event.data);
      console.log('Payload is:')
      console.log(payload);

      if(payload.command == "addUser") {
        addUserByID(payload.user);
      }

      if(payload.command == "removeUser") {
        removeUserByID(payload.user);
      }

      if(payload.command == "setClientID") {
        setClientID(payload.clientID);
      }

      // inform all senders on the CastMessageBus of the incoming message event
      // sender message listener will be invoked

      // window.messageBus.send(event.senderId, event.data);
    }

    // initialize the CastReceiverManager with an application status message
    window.castReceiverManager.start({statusText: "Application is starting"});
    console.log('Receiver Manager started');
};