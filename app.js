var config = require("./config");
if (config.get("newrelic_license_key")){
	require('newrelic');
}

var debug = require('debug')('p3api-server');
var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var dataTypeRouter = require("./routes/dataType");
var contentRouter = require("./routes/content");
var rpcHandler = require("./routes/rpcHandler");
var jbrowseRouter = require("./routes/JBrowse");
var indexer = require("./routes/indexer");
var cors = require('cors');
var http = require("http");
http.globalAgent.maxSockets=1024;

var app = module.exports =  express();

debug("APP MODE: ", app.get('env'))

require("./enableMultipleViewRoots")(app);
app.set('views', [
    path.join(__dirname, 'views'),
    path.join(__dirname, 'node_modules',"dme","views")
]);
app.set('view engine', 'ejs');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));

var reqId=0;

var stats=null;

process.on("message", function(msg){
	if (msg && msg.type=="stats"){
		stats = msg.data;
	}
});

app.use(function(req,res,next){
	req.id=reqId++;

	process.send({"event": "RequestStart", id: req.id});

	res.on("close", function(){
		console.log("Response Closed: ", req.id);
//		process.send({"event": "RequestComplete", id: req.id});
	});
	res.on("finish", function(){
//		console.log("Response Finished: ", req.id);
		process.send({"event": "RequestComplete",id: req.id});
	});

	next();
});

app.use(logger('[:date[clf]] :remote-user :method :url :status :response-time ms - :res[content-length]'));

app.use(function(req,res,next){
	debug("APP MODE: ", app.get('env'));
	req.production = (app.get('env')=='production')?true:false
	next();
});

app.use(cookieParser());

app.use(cors({origin: true, methods: ["GET,PUT,POST,PUT,DELETE"], allowHeaders: ["range","accept","x-range","content-type", "authorization"],exposedHeaders: ['facet_counts','x-facet-count','Content-Range', 'X-Content-Range'], credential: true, maxAge: 8200}));

app.use(express.static(path.join(__dirname, 'public')));

app.use("/js",express.static(path.join(__dirname, 'public/js')));

var collections = config.get("collections");

app.use('/indexer', indexer);

app.post("/", rpcHandler);

app.use("/health", function(req,res,next){
	res.write("OK");
	res.end();
});

app.use("/stats", function(req,res,next){
	if (stats){
		res.write(JSON.stringify(stats));
	}else{
		res.write("{}");
	}
	res.end();
});

app.use("/content", [
	contentRouter
])

// app.use("/testTimeout", function(req,res,next){
// 	setTimeout(function(){
// 		res.send("OK");
// 		res.end();
// 	},60 * 1000 * 5 );
// });

app.use("/jbrowse/",[
	jbrowseRouter
])

app.param("dataType", function(req,res,next,dataType){
    if (collections.indexOf(dataType)!=-1){
        next();
		return;
    } 
    next("route");
})

app.use('/:dataType/', [
	dataTypeRouter
]);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        debug("Dev env error handler: err status", err.status)
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    debug("Dev env error handler: ", " err status", err.status)
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

 debug("Launch Indexer");
if (config.get("enableIndexer")) {
	var indexer = require('child_process').fork(__dirname + "/bin/p3-index-worker");

	indexer.on("message", function(msg){
		debug("message from child",msg);
	});

	indexer.send({type: "start"});
}

//require("replify")({name: "p3api", path: "./REPL"},app,{});
