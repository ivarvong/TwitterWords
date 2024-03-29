/**
 * Module dependencies.
 */
//require.paths.unshift(__dirname);
var express = require('express'),
    routes = require('./routes'),
    twitter = require('ntwitter'),
    mongoskin = require('mongoskin'),
    sanitize = require('validator').sanitize,
    credentials = require('./credentials.js');

var db = mongoskin.db('localhost:27017/t1');

cache = {};
boolMapReduceRunnning = false;

setInterval(function () {
    var currentDate = new Date();
    var thresholdDate = new Date(currentDate - 1000 * 60 * 3); //remove anything older than 3 min ago
    db.collection('tweets1').find().count(function (err, results) {
        console.log("pre prune:", results);
    });

    db.collection('tweets1').remove({
        created: {
            $lte: thresholdDate
        }
    });

}, 1000 * 60 * 1);

var t = new twitter({
    consumer_key: credentials.consumer_key,
    consumer_secret: credentials.consumer_secret,
    access_token_key: credentials.access_token_key,
    access_token_secret: credentials.access_token_secret
});

ignorelist = ['', 'i', 'the', 'to', 'you', 'a', 'my', 'me', 'im', 'and', 'it', 'is', 'in', 'that', 'for', 'on', 'of', 'at', 'so', 'just', 'be', 'this', 'with', 'up', 'have', 'dont', 'but', 'your', 'was', 'get', 'what', 'all', 'do', 'its', 'no', 'if', 'u', 'not', 'when', 'know', 'out', 'we', 'are', 'they', 'about', 'can', 'rt', 'lt', 'or', 'thats', 'lol', 'tweetmyjobs', 'like', 'some', 'w', '2', 'he', 'job', 'jobs', 'ca', '@', '&', '(@'];

var allUS = '-126.210937,28.690588,-62.753906,46.860191';
var westUS = '-125.112305,32.731841,-99.000000,49.325122';
var westcoast = '-125.112305,32.731841,-116.499023,49.325122';
var oregon = '-124.892578,42.032974,-121.135254,45.9053';

setTimeout(function() {
	console.log("starting stream...");
	t.stream('statuses/filter', {
		'locations': allUS
	}, function (stream) {
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
				text = text.replace(/[^a-z0-9\s]/g, ''); //remove anything that's not a letter
				text = text.split(" ");
				text.forEach(function (word) {
					if (ignorelist.indexOf(word) < 0) {
						textlist.push(word);
					}
				});
	
				var d = {
					"text": data.text,
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
	
				db.collection('tweets1').save(d, function (ret) {
	
				});
	
			} catch (e) {
				console.log(e);
			}
	
		});
		stream.on('error', function (a, b) {
			console.log(a, b);
		});
	});
}, 2000);



function mapReduce(startDate, endDate, targetField, callback) {
	boolMapReduceRunnning = true; //hack a saurus :(
	
    var mapfunc = function () {

            if (MRtargetField == "text") {
                var targetObject = this.text.split(' ')
            } else {
                var targetObject = this[MRtargetField];
            }

            if (typeof targetObject == 'object') {
                targetObject.forEach(function (tag) {
                    emit(tag, {
                        count: 1
                    }); //call emit once per word/hashtag/url/whatever
                });
            }
        };

    var reducefunc = function (key, values) {
            var total = 0;
            for (var i = 0; i < values.length; i++) {
                total += values[i].count;
            }
            return {
                count: total
            };
        };

    db.collection('tweets1').mapReduce(mapfunc, reducefunc, {
        query: {
            created: {
                $gte: startDate,
                $lte: endDate
            }
        },
        scope: {
            MRtargetField: targetField
        },
        out: {
            replace: 'tempCollection'
        }
    }, function (err, outputcollection) {
    	try {
			outputcollection.find({
				"value.count": {
					$gt: 1
				}
			}).
			sort({
				"value.count": -1
			}).
			limit(120).
			toArray(function (err, results) {
				boolMapReduceRunnning = false; // :(
				callback(results);
			});
		} catch (e) {
			console.log("ERRRRRRRROR!!!!!!!!");
			callback([]);
		}
    });
}

var app = module.exports = express.createServer();

// Routes
app.get('/', function (req, res) {
    res.render('index')
});

app.get('/prune', function (req, res) {
    var currentDate = new Date();
    var thresholdDate = new Date(currentDate - 1000 * 60 * 30); //remove anything older than 30 min ago
    db.collection('tweets1').remove({
        created: {
            $lte: thresholdDate
        }
    });
});

app.get('/recent/:minutes?', function (req, res) {

    var minDelay = 10;
    if (req.params.minutes) {
        minDelay = parseInt(req.params.minutes);
    }


    var currentDate = new Date();
    var thresholdDate = new Date(currentDate - 1000 * 60 * minDelay);

    db.collection('tweets1').find({
        created: {
            $gte: thresholdDate
        }
    }).toArray(function (err, results) {
        console.log(results.length, "in", minDelay);
        res.json(results);
    });;

});

function doMapReduce(paramsStr, callback) {
	var params = JSON.parse(paramsStr);
	
	//console.log("paramsKey by dMR:", paramsStr);
	//console.log("params received by doMapReduce: ",params);
	var startTime = new Date();

    var targetField = "hashtags";
    if (params.targetField != undefined) {
        targetField = sanitize(params['targetField'].split(" ")[0]).xss(); //overkill?
    }

    var minDelay = 10;
    if (params.minutes != undefined) {
        minDelay = parseInt(params.minutes);
    }
    var currentDate = new Date();
    var thresholdDate = new Date(currentDate - 1000 * 60 * minDelay);

    mapReduce(thresholdDate, new Date(), targetField, function(results) {
        var arrayResults = [];
        results.forEach(function (pair) {
            arrayResults.push([pair['_id'], pair.value.count]);
        });
        cache[paramsStr] = {};
        cache[paramsStr].data = "tdata("+JSON.stringify(arrayResults)+")";
        cache[paramsStr].created = Date.now();
        var elapsedTime = (new Date() - startTime) / 1000;
        console.log(paramsStr, " ==> mapreduce in " + elapsedTime + " seconds at "+new Date());
        //console.log("cache: ", cache);
        
        callback(cache[paramsStr].data);
    });

}

app.get('/mapreduce/:targetField/:minutes', function (req, res) {
    console.log("GET /mapreduce", req.params);
    var params = {"targetField": req.params.targetField, "minutes": req.params.minutes};
    if (parseInt(params.minutes) > 4) {
    	params.minutes = "4"; //HACK
    }
    var paramsStr = JSON.stringify(params);
	//console.log("GET paramsStr:", paramsStr);
    if (typeof cache[paramsStr] == 'object' && Date.now() - cache[paramsStr].created < 3000) { 
    	console.log("!!! cache hit!");
    	res.send(cache[paramsStr].data);
    } else {
    	try {
	    	//console.log(cache[paramsStr], cache[paramsStr].created, Date.now(), Date.now()-cache[paramsStr].created);
    	} catch(e) { }
		//console.log("cache miss... building...");
		if (boolMapReduceRunnning == false) {
	    	doMapReduce(paramsStr, function(data) {
    			res.send(data);
	    	});
    	} else {
    		console.log("serving STALE DATAZZZZZZ");
    		res.send(cache[paramsStr].data); // send stale data if it's already processing
    	}
    }
});

app.get('/search/:searchWord?', function (req, res) {
	var searchStart = new Date();
    console.log("GET /search", req.params);
    db.collection('tweets1').find({
        textlist: req.params.searchWord
    }, {
        screenname: 1,
        text: 1,
        created: 1
    }).sort({
        created: -1
    }).limit(25).toArray(function (err, results) {
        //console.log(results);
        var arrayResults = []
        results.forEach(function (data) {
            arrayResults.push([data['screenname'], data['text'], data['created']]);
        });
        res.send("searchData(" + JSON.stringify(arrayResults) + ")");
        console.log(new Date() - searchStart, "for /search/",req.params.searchWord);
    });
});

// ***********************
// Configuration
// ***********************
app.configure(function () {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
});

app.configure('development', function () {
    app.use(express.errorHandler({
        dumpExceptions: true,
        showStack: true
    }));
});

app.configure('production', function () {
    app.use(express.errorHandler());
});

app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);