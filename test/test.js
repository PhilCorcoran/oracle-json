'use strict';
var express = require('express'),
oracle_json=require('../index.js');
var settings = require('./settings.json');
oracle_json.init(settings.database);

function start_app(){
	var app = express();
	app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
	app.use(express.logger("default"));

	app.get('/price', function(req, res) {

		oracle_json.connectExecute({procedure:"pkg_any.GetPrice",
			params:req.query,
			response:res,
			successFunc:function(data){
				res.send(data);
			}
		}
		);
	});
	app.get('/noinit', function(req, res) {
		oracle_json.init(null);
		oracle_json.connectExecute({procedure:"pkg_any.GetPrice",
			params:req.query,
			response:res,
			successFunc:function(data){
				res.send(data);
			}
		}
		);
	});
	app.get('/priceOnly', function(req, res) {

		oracle_json.connectExecuteOnly({procedure:"pkg_any.PutPrice",
			params:req.query,
			response:res,
			successFunc:function(data){
				res.send(data);
			}
		}
		);
	});	
	app.get('/badprocedure', function(req, res) {
		oracle_json.connectExecute({procedure:"bad_procedure",
			params:req.query,
			response:res,
			successFunc:function(data){
				res.send(data);
			}
		}
		);
	});

	app.get('/connectionlost', function(req, res) {
		oracle_json.close();
		oracle_json.connectExecute({procedure:"bad_procedure",
			params:req.query,
			response:res,
			successFunc:function(data){
				res.send(data);
			}
		}
		);
	});

	app.listen(settings.port);
	console.log("settings:"+JSON.stringify(settings));
};
start_app();

