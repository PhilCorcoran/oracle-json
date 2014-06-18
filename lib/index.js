/*
Connects to an Oracle database and exceutes Oracle procedures using JSON inputs and outputs

*/
var oracle=require('oracle');
module.exports = OJ;

function OJ (options) {
    if (!(this instanceof OJ)) return new OJ(options);
    options = options || {};
    this.connection=undefined;
    this.dbSettings=options.database;
    this.keepOpen=options.keepOpen;
    if(!options.noTest){
        this.reconnect();
    }
}
/* connect to oracle if not already connected */
OJ.prototype.connect = function () { 
    var self = this;
    return function(req,res,next){
        if(self.connection && self.connection.isConnected()){
            return next();
        }
        self.reconnect(next);               
    }
}

/*  Execute a procedure which has one of the following signatures;
1.JSON in and JSON out
{procedure:"pkg_test.getPrice",query:true,output:true} using the query params in the request
{procedure:"pkg_test.getPrice",body:true,output:true} using the req.body
{procedure:"pkg_test.",inputs:{planID:600,adults:1,children:0,students:0},output:true} using explicit inputs
2.JSON in and nothing out
{procedure:"pkg_rest_api.updateObj",body:true};
3.nothing in and JSON out
{procedure:"pkg_test.getConfig",output:true};
4.nothing in and nothing out
{procedure:"pkg_test.runit"};

Also puts the results in a cache if desired with a key based on the request

*/
OJ.prototype.execute = function (dbRequest) { 
    var self = this;
    return function(req,res,next){
        var callParams=getCallParams(dbRequest,req);
        var callString=getCallString(dbRequest);
        console.log('execute() CallString:%s | CallParams:%s',callString,JSON.stringify(callParams));
        self.connection.execute(callString,callParams,handle_result_err);
        function handle_result_err(err,results){
            if(!self.keepOpen){
                self.close();
            }
            if (err) {
                self.close();
                console.log("Oracle Error(1):%s",err);
                if(dbRequest.noRespond){
                    return next(err);
                }
                res.status(503).send("Database Error");
            } else if(!results || !results.returnParam) {
                console.log("Oracle no results from database: dbRequest.output%s",dbRequest.output);
                if(dbRequest.output){
                    if(!dbRequest.noRespond){
                        return next(err);
                    }
                    res.status(503).send("Database Error");
                }
                else{
                    res.send({status:'OK',results:'none expected'});
                }
            }else {
                if(dbRequest.cache){dbRequest.cache.put(results.returnParam,req);}
                if(dbRequest.noRespond){
                    res.locals.data=results.returnParam;
                    return next();
                }
                if(!res.get('Content-Type')){
                    res.header('Content-Type','application/json');
                }
                res.send(results.returnParam);
            }
        };
    }
}
OJ.prototype.reconnect=function(next){
    var self = this;
    console.log("reconnect() connecting to Oracle");
    oracle.connect(self.dbSettings,function(err, aConnection) {
        if(err){
            console.log("Oracle Error(3): Could not connect to Oracle"+err);
            process.exit(1);
        }else{
            self.connection=aConnection;
            if(next){
                return next();
            }
        }
    });
}

OJ.prototype.close=function(){
    var self=this;
    console.log("close():Closing Oracle connection");
    if(self.connection){
        self.connection.close();
        self.connection=undefined;
    }else{
        console.log("Error: close() called but connection was null");
    }
}
function getCallString(dbRequest){
    var callString='call '+dbRequest.procedure;
    if(dbRequest.inputs || dbRequest.body || dbRequest.query|| dbRequest.params){
        if(!dbRequest.output){
            callString+='(:1)';
        }else
        {
            callString+='(:1,:2)';
        }
    }else{
        if(!dbRequest.output){
            callString+='()';
        }else
        {
            callString+='(:1)';
        }
    }
    return callString;
}
function getCallParams(dbRequest,req){
    var callParams=[];
    if(dbRequest.inputs || dbRequest.body || dbRequest.query || dbRequest.params){
        var paramString;
        if(dbRequest.query){
            paramString=JSON.stringify(req.query);
        }else if(dbRequest.body){
            paramString=JSON.stringify(req.body);
        }else if(dbRequest.params){
            var o={};
            for(var p in req.params){
                o[p]=req.params[p];
            }
            paramString=JSON.stringify(o);
        }else{
            paramString=JSON.stringify(dbRequest.inputs);
        }
        callParams.push(paramString);
    }
    if(dbRequest.output){
        var out=new oracle.OutParam(oracle.OCCICLOB);
        callParams.push(out);
    }
    return callParams;
}
