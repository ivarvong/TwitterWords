var twitter = require('./ntwitter')
  , http = require('http')
  , credentials = require('./credentials.js');

var t = new twitter({
    consumer_key: credentials.consumer_key,
    consumer_secret: credentials.consumer_secret,
    access_token_key: credentials.access_token_key,
    access_token_secret: credentials.access_token_secret
});

westdict = {};
eastdict = {};

westtotal = 0;
easttotal = 0;

westtop50 = [];
westtop50_norm = [];

easttop50 = [];
easttop50_norm = [];

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
  'like',
  'some',
  'fuck',
  'w',
  '2',
  'he',
  'job',
  'jobs',
  'ca'];

function freqsort(a,b) {
	if (a[1] < b[1]) return 1;
	if (a[1] > b[1]) return -1;
	return 0;
}

function incr(dict, word) {
	if (dict[word]) {
		dict[word] += 1;
	} else {
		dict[word] = 1;
	}
}

function buildSummary(dict) {

	var out = [];
	var minfreq = 100;
	var maxfreq = 0;
	for(key in dict) {
		if (dict[key] > 0) {
			out.push([key, dict[key]]);
			if (dict[key] > maxfreq) {
				maxfreq = dict[key];
			} 
			if (dict[key] < minfreq) {
				minfreq = dict[key];
			}
		}
	}
	
	var top50 = out.sort(freqsort).slice(0,75);
	var top50_norm = [];
	for (var i in top50) {
		var r = top50[i];
		top50_norm.push([ r[0], Math.ceil(80*r[1]/maxfreq) ]);
		//top50_norm.push([ r[0], Math.ceil(5*r[1]) ]);
	}
	return top50_norm;

}

function incrList(wordlist, destdict) {
	for (var i in wordlist) {
		var word = wordlist[i];
		if (ignorelist.indexOf(word) < 0) { // true if word not in ignore wordlist... so let's count it
			incr(destdict,word);  //incr(destdict, word.text);// hashtag list needs .text to get to the word
		}
	}
}

t.stream('statuses/filter', {'locations':'-126.210937,28.690588,-62.753906,46.860191'}, function(stream) {
     stream.on('data', function (data) {
     	if (data.entities.hashtags.length > 0) {
			console.log(data.entities.hashtags, data.text);
		}
		
		try { 
			var geo = data.geo.coordinates; //if there aren't coordantes, this throws an error. try/catch is not a nice way to do this, sorry.
		

			var t = data.text;
			t = t.toLowerCase();
			t = t.replace(/[^a-z0-9\s]/g,''); //remove anything that's not a letter
			var wordlist = t.split(" ");

			/*var wordlist = data.entities.hashtags;*/
		
			if (geo[1] <= -99) { // less than -99 means west side of the country
				console.log("<<<<         " + t);
				incrList(wordlist, westdict);
				westtotal += 1;
	
			} else {
				//console.log(">>>> " + t);
				incrList(wordlist, eastdict);
				easttotal += 1;
			}
		
			
		} catch (e) {
			// no coordinates, do nothing
			//console.log("(no geo)");
		}
	});
	stream.on('end', function (response) {
		// Handle a disconnection
		console.log("end!");
	});
	stream.on('destroy', function (response) {
	// Handle a 'silent' disconnection from Twitter, no end/error event fired
		console.log("destroy!");
	});
	stream.on('error', function (response) {
	// Handle a 'silent' disconnection from Twitter, no end/error event fired
		console.log("error", repsonse);
	});
});



setInterval(function() {
	westtop50_norm = buildSummary(westdict);
	easttop50_norm = buildSummary(eastdict);
	//console.log(westdict);
	//console.log(eastdict);
	//console.log("total words:: west: "+westtotal+", east: "+easttotal);
}, 500);

setInterval(function() {
	westdict = {};
	eastdict = {};	
	westtotal = 0;
	easttotal = 0;
	console.log(new Date() +"RESET!");
}, 1000*60*15); // empty the database every 15 minutes


http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/javascript'});
  res.end("tdata(" + JSON.stringify({west: westtop50_norm, 
									 east: easttop50_norm,
									 westtotal: westtotal,
									 easttotal: easttotal}) + ");");
}).listen(1337, '127.0.0.1');

console.log('Server running at http://127.0.0.1:1337/');
