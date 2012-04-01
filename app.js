
/**
 * Module dependencies.
 */
//require.paths.unshift(__dirname);

var express = require('express')
  , routes = require('./routes')
  , twitter = require('./ntwitter')
  , mongoskin = require('mongoskin')
  , sanitize = require('validator').sanitize
  , credentials = require('./credentials.js');

var db = mongoskin.db('localhost:27017/t1?auto_reconnect=true');

setInterval(function() {
	var currentDate = new Date();
    var thresholdDate = new Date(currentDate-1000*60*20); //remove anything older than 20 min ago
    db.collection('tweets1').find().count(function(err, results) {
    	console.log("pre prune:", results);
    });
    
    db.collection('tweets1').remove({created: {$lte: thresholdDate}});
    
}, 1000*60);

var t = new twitter({
    consumer_key: credentials.consumer_key,
    consumer_secret: credentials.consumer_secret,
    access_token_key: credentials.access_token_key,
    access_token_secret: credentials.access_token_secret
});

ignorelist = [ '',
  'i',
  'the',
  'to',
  'you',
  'a',
  'my',
  'me',
  'im',
  'and',
  'it',
  'is',
  'in',
  'that',
  'for',
  'on',
  'of',
  'at',
  'so',
  'just',
  'be',
  'this',
  'with',
  'up',
  'have',
  'dont',
  'but',
  'your',
  'was',
  'get',
  'what',
  'all',
  'do',
  'its',
  'no',
  'if',
  'u',
  'not',
  'when',
  'know',
  'out',
  'we',
  'are',
  'they',
  'about',
  'can',
  'rt',
  'lt',
  'or',
  'thats',
  'lol', 
  'tweetmyjobs',
  'like',
  'some',
  'w',
  '2',
  'he',
  'job',
  'jobs',
  'ca',
  '@',
  '&',
  '(@'];

var allUS =  '-126.210937,28.690588,-62.753906,46.860191';
var westUS = '-125.112305,32.731841,-99.000000,49.325122';
var westcoast = '-125.112305,32.731841,-116.499023,49.325122';
var oregon = '-124.892578,42.032974,-121.135254,45.9053';

t.stream('statuses/filter', {'locations': allUS},
    function(stream) {
        stream.on('data', function (data) {
        //console.log(data);

        try {

            var url_db = [];
            if (data.entities.urls.length > 0) {
                for (var i in data.entities.urls) {
                    url_db.push(data.entities.urls[i].expanded_url);
                }
            }
            
            var hashtags_db = [];
            for (var i in data.entities.hashtags) {
                hashtags_db.push(data.entities.hashtags[i].text);
            }
            
            var coordinates_db = [];
            if (data.coordinates && data.coordinates.coordinates) {
                coordinates_db = data.coordinates.coordinates;
            }
            
            var location_db = "";
            if (data.location) {
                location_db = data.location;
            }
            
            var textlist = [];
            var text = data.text.toLowerCase();
            text = text.replace(/[^a-z0-9\s]/g,''); //remove anything that's not a letter
			text = text.split(" ");
			text.forEach(function(word) {
				if (ignorelist.indexOf(word) < 0) {
					textlist.push(word);
				}
			});
            
            var d = {"text": data.text,
            		 "textlist": textlist,
                     "placename": data.place.full_name,
                     "screenname": data.user.screen_name,
                     "userid": data.user.id_str,
                     "lang": data.user.lang,
                     "location": location_db,
                     "coordinates": coordinates_db,
                     "hashtags": hashtags_db,
                     "urls": url_db,
                     "mentions": data.entities.user_mentions,
                     "name": data.user.name,
                     "id": data.id,
                      "statuses_count": data.user.statuses_count,
                      "created": new Date()
                     };

            db.collection('tweets1').save(d, function(ret) {    
                
            });
            
        } catch (e) {
            console.log(e);
        }

    });
    stream.on('error', function(a, b) {
        console.log(a, b);
    });
});

var app = module.exports = express.createServer();

// Routes

app.get('/', function(req, res) {
  res.render('index')
});

app.get('/prune', function(req, res) {
 	var currentDate = new Date();
    var thresholdDate = new Date(currentDate-1000*60*30); //remove anything older than 30 min ago
    db.collection('tweets1').remove({created: {$lte: thresholdDate}});
});

app.get('/recent/:minutes?', function(req, res){
    
    var minDelay = 10;
    if (req.params.minutes) {
        minDelay = parseInt(req.params.minutes);
    }       

    
    var currentDate = new Date();
    var thresholdDate = new Date(currentDate-1000*60*minDelay);
    
    db.collection('tweets1').find({created: {$gte: thresholdDate}}).toArray(function(err, results) {
        console.log(results.length, "in", minDelay);
        res.send(results);  
    });;

});

app.get('/mapreduce/:targetfield?/:minutes?', function(req, res) {
	console.log("GET /mapreduce", req.params);
	var startTime = new Date();

    var targetfield = "hashtags";
    if (req.params.targetfield != undefined) {     
        targetfield = sanitize(req.params['targetfield'].split(" ")[0]).xss(); //overkill?
    }
    
    var minDelay = 10;
    if (req.params.minutes != undefined) {
        minDelay = parseInt(req.params.minutes);
    }   
    var currentDate = new Date();
    var thresholdDate = new Date(currentDate-1000*60*minDelay);
    
    
    try {
    
        /* set up map reduce */
        var mapfunc = function() {
        
            //MRtargetField is the "scope"-ed targetField passed in the mapreduce call. I put MR just to distinguish it from the other one. 
            if (MRtargetField == "text") { // this one is a little different, because i need to split the words into an array. hashtags and urls are already arrays in the db.
                var targetObject = this.text.split(' ')
            } else {
                var targetObject = this[MRtargetField];
            }
            
            if (typeof targetObject == 'object') {
	            targetObject.forEach(function(tag) {
	            	//if (ignorelist.indexOf(tag.toLowerCase()) < 0) {  //WOW! it's almost twice as fast to NOT do this check. leaving it commented out...
	    	            emit(tag , {count: 1}); //call emit once per word/hashtag/url/whatever
    				//}
    			});
			}
        };
        
        var reducefunc = function(key, values) {
            var total = 0;
            for (var i=0; i<values.length; i++) {
                total += values[i].count;
            }
            return {count: total};
        };



        db.collection('tweets1').mapReduce(mapfunc, reducefunc, {query: {created: {$gte: thresholdDate}}, 
                                                                 scope: {MRtargetField: targetfield, ignorelist: ignorelist}, 
                                                                   out: {replace:'tempCollection'}
                                                                }, function(err, outputcollection) {
                                                                        outputcollection.find({"value.count": {$gt: 1}}).
                                                                                         sort({"value.count": -1}).
                                                                                         limit(120).
                                                                                         toArray(function(err, results) {
                                                                                                var arrayResults = []
                                                                                                results.forEach(function(pair) {
                                                                                                    arrayResults.push([pair['_id'], pair.value.count]);
                                                                                                });
                                                                                                res.send("tdata("+JSON.stringify(arrayResults)+")");
                                                                                                var elapsedTime = (new Date() - startTime)/1000;
                                                                                                console.log("mapreduce in "+elapsedTime +" seconds");
                                                                                         });    
                                                                    });
    } catch (e) {
        res.send("Uh oh! " +JSON.stringify(e)); //passing an invalid 
    }

});

app.get('/search/:searchWord?', function(req, res) {
	console.log("GET /search", req.params);
	db.collection('tweets1').find({textlist: req.params.searchWord}, {screenname: 1, text: 1, created: 1}).sort({created: -1}).limit(25).toArray(function(err, results) {
		//console.log(results);
		var arrayResults = []
		results.forEach(function(data) {
			arrayResults.push([ data['screenname'], data['text'], data['created']]);
		});
		res.send("tdata("+JSON.stringify(arrayResults)+")");
	});
});

// ***********************
// Configuration
// ***********************

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
