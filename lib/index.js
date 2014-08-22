/*
Connects to an Oracle database and exceutes Oracle procedures using JSON inputs and outputs

*/
var oracle=require('oracle');
module.exports = OJ;

function OJ (options) {
    if (!(this instanceof OJ)) return new OJ(options);
    options = options || {};
    this.connection=undefined;
    if(!options.database || !options.database.hostname || ! options.database.database || !options.database.user || !options.database.password){
        throw new Error('Invalid database config. Expecting hostname, database, user, password');
    }
    this.dbSettings=options.database;
    this.keepOpen=options.keepOpen;
    this.executing=0;
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
OJ.prototype.admin=function(){
    var self=this;
    return function(req,res,next){
        if(req.url=='/admin'){
            var stats={executing:self.executing,connection:'none'}
            if(self.connection && self.connection.isConnected()){
                stats.connection='good';
            }
            return res.send(stats);
        }
        return next();
    }
}
/*  Execute a procedure which has one of the following signatures;
1.JSON in and JSON out
{procedure:"pkg_test.getPrice",request:"query",output:true} using the req.query params
{procedure:"pkg_test.getPrice",request:"body",output:true} using the req.body params
{procedure:"pkg_test.getPrice",request:"allParams",output:true} using the req.allParams object
{procedure:"pkg_test.",inputs:{planID:600,adults:1,children:0,students:0},output:true} using explicit inputs
2.JSON in and nothing out
{procedure:"pkg_rest_api.updateObj",request:"body"};
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
        self.executing=self.executing+1;
        self.connection.execute(callString,callParams,handle_result_err);
        function handle_result_err(err,results){
            console.log('handle_result_err() Oracle call returned');
            self.executing=self.executing-1;
            if(!self.keepOpen){
                self.close();
            }
            if (err) {
                self.close();
                console.log("Oracle Error(1):%s",err);
                if(dbRequest.noRespond){
                    return next(new Error("Database Error"));
                }
                res.status(503).send("Database Error");
            } else if(!results || !results.returnParam) {
                console.log("Oracle no results from database: dbRequest.output%s",dbRequest.output);
                if(dbRequest.output){
                    if(!dbRequest.noRespond){
                        return next(new Error("Database Error"));
                    }
                    res.status(503).send("Database Error");
                }
                else{
                    res.send({status:'OK',results:'none expected'});
                }
            }else {// the database returned a result
                if(dbRequest.cache){dbRequest.cache.put(results.returnParam,req);}
                if(!res.get('Content-Type')){
                    res.header('Content-Type','application/json');
                }
                var data;
                try {
                    data=JSON.parse(results.returnParam);
                }
                catch(err) {
                    return next(new Error('Database invalid response'));
                }
                if(data.status && data.status.toUpperCase()!='OK'){
                    console.log('Database Error:%s',JSON.stringify(data));
                    self.close();
                    return next(new Error('Database not OK'));
                }                
                if(dbRequest.noRespond){
                    res.locals.data=data;
                    return next();
                }
                res.send(data);
            }
        };
    }
}
OJ.prototype.reconnect=function(next){
    var self = this;
    console.log("reconnect() connecting to Oracle");
    self.executing=0;
    self.connection=oracle.connectSync(self.dbSettings);
    if(next)return next();
}

OJ.prototype.close=function(){
    var self=this;
    console.log("close(): Oracle procedure executions:%s",self.executing);
    if(self.connection && self.connection.isConnected() && self.executing<1){
        self.connection.close();
        self.connection=undefined;
    }else{
        console.log("Warning: close() called but connection was null");
    }
}
function getCallString(dbRequest){
    var callString='call '+dbRequest.procedure;
    if(dbRequest.inputs || dbRequest.request){
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
    if(dbRequest.inputs || dbRequest.request){
        var paramString;
        if(dbRequest.inputs){
            paramString=JSON.stringify(dbRequest.inputs);
        }else{
            paramString=JSON.stringify(req[dbRequest.request]);
        }
        callParams.push(paramString);
    }
    if(dbRequest.output){
        var out=new oracle.OutParam(oracle.OCCICLOB);
        callParams.push(out);
    }
    return callParams;
}
