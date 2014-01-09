/*
Connects to an Oracle database and exceutes Oracle procedures.
execute expects to return a JSON result as an out parameter
execute_only expects no result
Some procedures accept a JSON input parameter while others take no parameter
*/
var oracle=require('oracle');
var dbSettings=null;
var lastOracleError="";
var aSecret="someSecret";

function init(settings){
        dbSettings=settings.database;
        aSecret=settings.secret;
}

/*  Execute a procedure which returns a JSON clob 
        dbRequest={procedure,params,response,successFunc} 
        */
        function execute(dbRequest,connection){
                if(dbRequest.params!==undefined){
                        var callString='call '+dbRequest.procedure+'(:1,:2)';
                        var paramString=JSON.stringify(dbRequest.params);
                        console.log("Oracle: "+callString +" params:"+paramString);
                        connection.execute(callString, [paramString,new oracle.OutParam(oracle.OCCICLOB)],handle_result_err);
                }else{
                        var callString='call '+dbRequest.procedure+'(:1)';
                        console.log("Oracle: "+callString);
                        connection.execute(callString, [new oracle.OutParam(oracle.OCCICLOB)],handle_result_err);
                }
                function handle_result_err(err,results){
                        close(connection);
                        if (err) {
                                console.log("Oracle Error(1): "+err);
                                lastOracleError=(new Date()).valueOf()+":"+err;
                                dbRequest.response.status(503).send("Database Error");
                        } else if(!results || ! results.returnParam) {
                                console.log("Oracle Error(2): no results from database");
                                lastOracleError=(new Date()).valueOf()+":Oracle Error(2): no results from database";
                                dbRequest.response.status(503).send("Database Error");
                        }else {
                                dbRequest.successFunc(results.returnParam);
                        }
                };
        }
        function validate(dbRequest){
                if(dbSettings===null){
                        console.log("Error. init() was never called");
                        dbRequest.response.status(503).send("Database Error");
                }
                if(dbRequest.procedure===undefined){
                        console.log("Error. procedure is not defined");
                        dbRequest.response.status(503).send("Database Error");
                }
        }
        function connectExecute(dbRequest){
                lastOracleError="";
                var dbRequest=dbRequest;
                validate(dbRequest);
                console.log("Trying to connect to Oracle");
                oracle.connect(dbSettings,function(err, connection) {
                        if(err){
                                console.log("Error: Could not connect to Oracle."+err);
                                lastOracleError=(new Date()).valueOf()+":"+err;
                                close(connection);
                                dbRequest.response.status(503).send("Database Error");
                        }else{
                                execute(dbRequest,connection);
                        }
                });
        }
        function connectExecuteOnly(dbRequest){
                lastOracleError="";
                var dbRequest=dbRequest;
                validate(dbRequest);
                if(dbSettings===null){
                        console.log("Error. init() was never called");
                        dbRequest.response.status(503).send("Database Error");
                }
                if(dbRequest.procedure===undefined){
                        console.log("Error. procedure is not defined");
                        dbRequest.response.status(503).send("Database Error");
                }
                console.log("Trying to connect to Oracle:"+dbSettings);
                oracle.connect(dbSettings,function(err, connection) {
                        if(err){
                                console.log("Oracle Error(3): Could not connect to Oracle"+err);
                                lastOracleError=(new Date()).valueOf()+":"+err;
                                close(connection);
                                dbRequest.response.status(503).send("Database Error");
                        }else{
                                execute_only(dbRequest,connection);
                        }
                });
        }
        function testConnect(successFunc,errorFunc){
                console.log("Testing connection to Oracle");
                lastOracleError="";
                if(dbSettings===null){
                        console.log("Error. init() was never called");
                }
                oracle.connect(dbSettings,function(err, connection) {
                        close(connection);
                        if(err){
                                console.log("Oracle Error(3): Could not connect to Oracle"+err);
                                lastOracleError=(new Date()).valueOf()+":"+err;
                                errorFunc();
                        }else{
                                successFunc();
                        }
                });
        }
        /* Execute a procedure which returns no results */
        function execute_only(dbRequest,connection){
                if(dbRequest.params===undefined){
                        connection.execute("call"+dbRequest.procedure+"()", [],handle_result_err);
                }else{
                        var callString='call '+dbRequest.procedure+'(:1)';
                        var paramString=JSON.stringify(dbRequest.params);
                        console.log("Oracle:"+callString +" params:"+paramString);
                        connection.execute(callString, [paramString],handle_result_err);
                }
                function handle_result_err(err,results){
                        close(connection);                        
                        if (err) {
                                console.log("Oracle Error(4): "+err);
                                lastOracleError=(new Date()).valueOf()+":"+err;
                                dbRequest.response.status(503).send("Database Error");
                        }else {
                                dbRequest.successFunc();
                        }
                };
        }
        function close(connection){
                console.log("Closing Oracle connection");
                if(connection !==null && connection !==undefined){
                        connection.close();
                }else{
                        console.log("Error: close() called but connection was null or undefined");
                }
        }
        function lastError(){
                return "from Oracle:"+lastOracleError;
        }
        function admin(req,res,next){
                switch(req.path){
                        case "/error":
                        if(req.method!="POST"){
                                res.status(401).send("Not available");
                                break;
                        }
                        if(!req.body.secret || aSecret !==req.body.secret){
                                res.status(401).send("Unauthorized");
                                break;
                        }else{
                                res.send({error:lastError()});
                        }
                        break;
                        default:
                        res.send('no matching url');
                        break;
                }
        }
        exports.connectExecute=connectExecute;
        exports.connectExecuteOnly=connectExecuteOnly;
        exports.init=init;
        exports.testConnect=testConnect;
        exports.lastError=lastError;
        exports.admin=admin;


