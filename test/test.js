'use strict';
var express = require('express'),
oracle_json=require('../index.js');
var settings = require('./settings.json');
oracle_json.connect(settings.database,start_app);

function start_app(){
	var app = express();
	app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
	app.use(express.logger("default"));

	app.get('/price', function(req, res) {
		oracle_json.execute("pkg_any.GetPrice",req.query,res,function (data){
			res.send(data);
		});
	});
	app.get('/badprocedure', function(req, res) {
		oracle_json.execute_only("test_bad_procedure",req.query,res,function (data){
			res.send(data);
		});
	});
	app.get('/connectionlost', function(req, res) {
		oracle_json.close();
		oracle_json.execute_only("anyprocedure",req.query,res,function (data){
			res.send(data);
		});
	});

	app.listen(settings.port);
	console.log("settings:"+JSON.stringify(settings));
};

