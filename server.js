var express = require('express');
var path = require('path');
var graphqlHTTP = require('express-graphql');
var jwt = require('express-jwt');
const fileUpload = require('express-fileupload');
const auth = require('./utils/login');
const bodyParser = require('body-parser');
const globals = require('./config/globals');
const JOIN = require('./utils/join-models');
const simpleExport = require('./utils/simple-export');
const {GraphQLDateTime, GraphQLDate, GraphQLTime } = require('graphql-iso-date');
const execute = require('./utils/custom-graphql-execute');
const checkAuthorization = require('./utils/check-authorization');
const helper = require('./utils/helper');
const nodejq = require('node-jq')
const {JSONPath} = require('jsonpath-plus');
const graphqlFormatError = require('./node_modules/graphql/error/formatError');
const errors = require('./utils/errors');
const { printError } = require('graphql');

var {
  graphql, buildSchema
} = require('graphql');
var mergeSchema = require('./utils/merge-schemas');
var acl = null;

var cors = require('cors');


  /* Server */
const APP_PORT = globals.PORT;
const app = express();

app.use((req, res, next)=> {

// Website you wish to allow to connect
res.setHeader('Access-Control-Allow-Origin', globals.ALLOW_ORIGIN);
//res.setHeader('Access-Control-Expose-Headers', 'Access-Control-Allow-Origin');

// Request methods you wish to allow
//res.setHeader('Access-Control-Allow-Methods',
//  'GET, POST, OPTIONS, PUT, PATCH, DELETE');

// Request headers you wish to allow
//res.setHeader('Access-Control-Allow-Headers',
//  'X-Requested-With,content-type,authorization,Authorization,accept,Accept');
  next();
});

// Force users to sign in to get access to anything else than '/login'
console.log("REQUIRE: ",globals.REQUIRE_SIGN_IN);
if(globals.REQUIRE_SIGN_IN === "true"){
  app.use(jwt({ secret: 'something-secret'}).unless({path: ['/login']}));
}


/* Temporary solution:  acl rules set */
if (process.argv.length > 2 && process.argv[2] == 'acl') {
 var node_acl = require('acl');
 var {
   aclRules
 } = require('./acl_rules');
 var acl = new node_acl(new node_acl.memoryBackend());

 /* set authorization rules from file acl_rules.js */
 acl.allow(aclRules);
 console.log("Authoization rules set!");

} else {
 console.log("Open server, no authorization rules");
}

/* Schema */
console.log('Merging Schema');
var merged_schema = mergeSchema(path.join(__dirname, './schemas'));
console.log(merged_schema);
var Schema = buildSchema(merged_schema);
/*set scalar types for dates */
Object.assign(Schema._typeMap.DateTime, GraphQLDateTime);
Object.assign(Schema._typeMap.Date, GraphQLDate);
Object.assign(Schema._typeMap.Time, GraphQLTime);

/* Resolvers*/
var resolvers = require('./resolvers/index');




app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json({limit: globals.POST_REQUEST_MAX_BODY_SIZE}));

app.use('/login', cors(), (req, res)=>{

auth.login(req.body).then( (token) =>{
  res.json({token: token});
}).catch((err) =>{
  console.log(err);
  res.status(500).send({error: "Wrong email or password. Please check your credentials."})
});

});




app.use('/join', cors(), (req, res) => {

  // check if the Content-Type is in JSON so that bodyParser can be applied automatically
  if (!req.is('application/json'))
      return res.status(415).send({error: "JSON Content-Type expected"});

  let context = {
      request: req,
          acl: acl,
          benignErrors: [],
          recordsLimit: globals.LIMIT_RECORDS
  };

  // select the output format
  let params = req.body;
  let joinModels = {};

  if(params.outputFormat === 'TEST'){
      joinModels = new JOIN.JoinModels(context);
  }else if(params.outputFormat === 'CSV'){
      joinModels = new JOIN.JoinModelsCSV(context);
  }else if(params.outputFormat === 'JSON'){
      joinModels = new JOIN.JoinModelsJSON(context);
  }else{
      return res.status(415).send({error: "outputFormat = TEST/CSV/JSON is required"});
  }

  // start data transmission
  joinModels.run(req.body, res).then(() => {
      res.end();
  }).catch(error => {
      let formattedError = {
          message: error.message,
          details: error.originalError && error.originalError.errors ? error.originalError.errors : "",
          path: error.path
      };
      res.status(500).send(formattedError);
  });
});



app.use('/export', cors(), (req, res, next) =>{

  //set checker for using in the local method simpleExport
  res['responseSent'] = false;

  //set MAX_TIME_OUT
  res.setTimeout(globals.EXPORT_TIME_OUT * 1000, function(){
    res.end("TIMEOUT EXCEEDS");
  });

  res.on('finish', ()=>{
    res['responseSent'] = true;
  });

 let context = {
   request: req,
   acl : acl,
   benignErrors: [],
   recordsLimit: globals.LIMIT_RECORDS
 }

 let body_info = req.query;

  simpleExport(context, body_info ,res).then( () =>{
    res.end();
  }).catch(error =>{

   if(!res.responseSent){
     res.status(500).send(error);
   }else{
      console.error("ERROR IN EXPORT AFTER SENDING THE RESPONSE:", error);
   }

  });
});




app.use(fileUpload());
/*request is passed as context by default  */
app.use('/graphql', cors(), graphqlHTTP((req) => ({
 schema: Schema,
 rootValue: resolvers,
 pretty: true,
 graphiql: true,
 context: {
   request: req,
   acl: acl,
   benignErrors: [],
   recordsLimit: globals.LIMIT_RECORDS
 },
 customExecuteFn: execute.execute,
 customFormatErrorFn: function(error){
   errors.customErrorLog(error) // Will log the error either compact (defualt) or verbose dependent on the env variable "ERROR_LOG"
   let extensions = errors.formatGraphQLErrorExtensions(error);
   return {
     message: error.message,
     locations: error.locations ? error.locations : "",
     // Either use the extensions of a remote error, or
     // the local originalError.errors generated by for example validation Errors (AJV):
     extensions: extensions,
     path: error.path
   };

 }
})));

// '==' checks for both 'null' and 'undefined'
function eitherJqOrJsonpath(jqInput, jsonpathInput) {
 let errorString = "State either 'jq' or 'jsonPath' expressions, never both.";
 if (helper.isNotUndefinedAndNotNull(jqInput) && helper.isNotUndefinedAndNotNull(jsonpathInput)) {
 throw new Error(errorString + " - jq is " + jqInput + " and jsonPath is " + jsonpathInput);
 }
 if (!helper.isNotUndefinedAndNotNull(jqInput) && !helper.isNotUndefinedAndNotNull(jsonpathInput)) {
 throw new Error(errorString + " - both are null or undefined");
 }
}

async function handleGraphQlQueriesForMetaQuery(queries, context) {
 let compositeResponses = {};
 compositeResponses.data = [];
 compositeResponses.errors = [];
 for (let query of queries) {
   let singleResponse = await graphql(Schema, query, resolvers, context);
   if (singleResponse.errors != null) {
     compositeResponses.errors.push(...singleResponse.errors);
   }
   compositeResponses.data.push(singleResponse.data);
 }
 return compositeResponses;
}

app.post('/meta_query', cors(), async (req, res, next) => {
 try {
 let context = {
   request: req,
   acl: acl,
   benignErrors: [],
   recordsLimit: globals.LIMIT_RECORDS
 }
 if (req != null) {
     if (await checkAuthorization(context, 'meta_query', '') === true) {
       let queries = req.body.queries;
       let jq = req.body.jq;
       let jsonPath = req.body.jsonPath;
       eitherJqOrJsonpath(jq, jsonPath);

       if (!Array.isArray(queries)) {
         let newQueries = [queries];
         queries = newQueries;
       }

       let graphQlResponses = await handleGraphQlQueriesForMetaQuery(queries, context);
       let output;
       if (helper.isNotUndefinedAndNotNull(jq)) { // jq
         output = await nodejq.run(jq, graphQlResponses, { input: 'json', output: 'json'});
       } else { // JSONPath
         output = JSONPath({path: jsonPath, json: graphQlResponses, wrap: false});
       }
       res.json(output);
       next();
     } else {
         throw new Error("You don't have authorization to perform this action");
     }
 }
} catch (error) {
 res.json( { data: null, errors: [graphqlFormatError.formatError(error)] });
}
});

// Error handling
app.use(function (err, req, res, next) {
   if (err.name === 'UnauthorizedError') { // Send the error rather than to show it on the console
       res.status(401).send(err);
   }
   else {
       next(err);
   }
});

var server = app.listen(APP_PORT, () => {
 console.log(`App listening on port ${APP_PORT}`);
});

module.exports = server;
