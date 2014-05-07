var getParameterByName = function(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
};

var preloadImages = function(images) {
	for(var i=0; i < images.length; i++){
		var imageObj = new Image();
		imageObj.src = images[i];
	}
};

var preloadVideos = function(videos) {
	for(var i=0; i < videos.length; ) {
			var video = new Video();
			video.src = videos[i];
		}
};

var showPlaying = false,
	CLIENT_ID = window.location.hash.substr(1),
	INSTAGRAM_URL = 'https://api.instagram.com/v1/';


// Instagram module
var InstagramUser = function(user) {
	this.user = user;
	this.images = [];
	this.videos = [];
	this.deferred = $.Deferred();
};

InstagramUser.prototype.getRecentMedia = function(url) {
	if(!url) {
		url = INSTAGRAM_URL + 'users/' + this.user + '/media/recent/?count=500&client_id=' + CLIENT_ID;
	}

	var self = this;

	$.getJSON(url + '&callback=?', function(resp){
		// Update media
		var images = _.map(resp.data, function(post) { if(post.images) return post.images.standard_resolution.url; }),
			videos = _.map(resp.data, function(post) { if(post.videos) return post.videos.standard_resolution.url; });

		self.images = self.images.concat(images);
		self.videos = self.videos.concat(videos);

		// Go to next page or resolve
		if(resp.pagination && resp.pagination.next_url) {
			self.getRecentMedia(resp.pagination.next_url);
		} else {
			self.deferred.resolveWith(self, [{images: self.images, videos: self.videos}]);
		}
	});
};


// Core work
var getAllMedia = function(callback) {
	var users = getParameterByName('users').split(','),
		deferreds = [];

	deferreds = _.map(users, function(user) {
		var instagramUser = new InstagramUser(user);
		instagramUser.getRecentMedia();
		return instagramUser.deferred;
	});

	$.when.apply(null, deferreds)
		.done(function(){ 
			var images = _(arguments).pluck('images').flatten().compact().shuffle().value(),
				videos = _(arguments).pluck('videos').flatten().compact().shuffle().value();

			callback({images: images, videos: videos});
		});
};




var SlideController = function() {};

SlideController.prototype.render = function(images) {
	var layouts = ["one", "two", "three", "four"];

	$(".container")
		.empty()
		.removeClass(layouts.join(" "));

	_.each(images, function(image) {
		var $div = $("<div></div>");
		$div.css('background-image', 'url(' + image + ')');
		$(".container").append($div);
	});

	var layout = layouts[images.length - 1];
	$(".container").addClass(layout);
};

var SlideShowController = function(media) {
	this.images = media.images;
	this.videos = media.videos;

	this.imageIndex = 0;
	this.videosIndex = 0;
	this.slideController = new SlideController();
	this.interval = 5000;

	this.loopID = null;
};

SlideShowController.prototype.play = function() {
	var self = this;
	this.loopID = setInterval(function(){ self.nextSlide() }, this.interval);
};

SlideShowController.prototype.stop = function() {
	window.clearInterval(this.loopID);
};

SlideShowController.prototype.nextSlide = function() {
	console.log("imageIndex: " + this.imageIndex);
	var numberOfSlides = _.random(1,3);
	this.slideController.render(this.images.slice(this.imageIndex, this.imageIndex + numberOfSlides));
	this.imageIndex += numberOfSlides;
	// Preload the next batch
	preloadImages(this.images.slice(this.imageIndex, this.imageIndex + 4));
	// preloadVideos(...);
};

var slideShow;
getAllMedia(function(media) {
	console.log(media);
	preloadImages(media.images.slice(0, 4));
	// preloadImages(media.images.slice(0, 4));

	$(document).ready(function() {
		slideShow = new SlideShowController(media);
		slideShow.play();
	});
});
