const objectAssign = require('object-assign');
const math = require('mathjs');
const _ = require('lodash');


  /**
   * paginate - Creates pagination argument as needed in sequelize cotaining limit and offset accordingly to the current
   * page implicit in the request info.
   *
   * @param  {object} req Request info.
   * @return {object}     Pagination argument.
   */
  paginate = function(req) {
    selectOpts = {}
    if (req.query.per_page){ selectOpts['limit'] = req.query.per_page}
    else{ selectOpts['limit'] = 20}
    if (req.query.page) {
      os = (req.query.page - 1) * selectOpts['limit']
      selectOpts['offset'] = os
    }
    return selectOpts
  }

  /**
   * requestedUrl - Recover baseUrl from the request.
   *
   * @param  {object} req Request info.
   * @return {string}     baseUrl from request.
   */
  requestedUrl = function(req) {
    //console.log(req.port)
    //console.log(req.headers.host)
    //let port = req.port|| 2000;
    return req.protocol + '://' + req.headers.host +
      //(port == 80 || port == 443 ? '' : ':' + port) +
      req.baseUrl;
  }

  /**
   * prevNextPageUrl - Creates request string for previous or next page int the vue-table data object.
   *
   * @param  {object} req        Request info.
   * @param  {boolean} isPrevious True if previous page is requestes and false if next page is requested.
   * @return {string}            String request for previous or next page int the vue-table data object.
   */
  prevNextPageUrl = function(req, isPrevious) {
    //console.log("Requested URL", req);
    let baseUrl = requestedUrl(req).replace(/\?.*$/, '')
    let query = ["query="+req.query.query]
    i = isPrevious ? -1 : 1
    // page
    p = req.query.page == '1' ? null : (req.query.page + i)
    query = query.concat(['page=' + p])
    // per_page
    query = query.concat(['per_page=' + (req.query.per_page || 20)])
    // filter
    if (req.query.filter) query = query.concat(['filter=' + req.query.filter])
    // sort
    if (req.query.sort) query = query.concat(['sort=' + req.query.sort])
    // Append query to base URL
    if (query.length > 0) baseUrl += "?" + query.join("&")
    return baseUrl
  }

  /**
   * sort - Creates sort argument as needed in sequelize and accordingly to the order implicit in the resquest info.
   *
   * @param  {object} req Request info.
   * @return {object}     Sort argument object as needed in the schema to retrieve filtered records from a given model.
   */
  sort = function(req) {
    let sortOpts = {}
    if (req.query.sort) {
      sortOpts = {
        order: [req.query.sort.split('|')]
      }
    }
    return sortOpts
  }

  /**
   * search - Creates search argument as needed in sequelize and accordingly to the filter string implicit in the resquest info.
   *
   * @param  {object} req           Request info. This info will contain the substring that will be used to filter records.
   * @param  {array} strAttributes Name of model's attributes
   * @return {object}               Search argument object as needed in the schema to retrieve filtered records from a given model.
   */
  search = function(req, strAttributes) {
    let selectOpts = {}
    if (req.query.filter) {
      let fieldClauses = []
      strAttributes.forEach(function(x) {
        let fieldWhereClause = {}
        if (x !== "id") {
          fieldWhereClause[x] = {
            $like: "%" + req.query.filter + "%"
          }
          fieldClauses = fieldClauses.concat([fieldWhereClause])
        } else {
          if (/^\d+$/.test(req.query.filter)) {
            fieldWhereClause[x] = req.query.filter
            fieldClauses = fieldClauses.concat([fieldWhereClause])
          }
        }
      })
       selectOpts['where'] = {
        $or: fieldClauses
      }
    }
    return selectOpts
  }

// includeAssociations = function (req) {
//     return req.query.excludeAssociations ? {} : {
//       include: [{
//         all: true
//       }]
//     }
// }

/**
 * searchPaginate - Creates one object mergin search, sort, and paginate arguments
 *
 * @param  {object} req           Request info.
 * @param  {array} strAttributes Name of model's attributes.
 * @return {object}               General argument for filtering models in sequelize.
 */
searchPaginate = function(req, strAttributes) {
  return objectAssign(
    search(req, strAttributes),
    sort(req),
    paginate(req)
    //,includeAssociations(req)
  );
}

/**
 * vueTable - Creates object needed to display a vue-table in a vuejs SPA
 *
 * @param  {object} req           Request info.
 * @param  {object} model         Sequelize model which records are intended to be displayed in the vue-table.
 * @param  {array} strAttributes Name of model's attributes.
 * @return {object}               Info for displaying vue-table in a vuejs SPA, including info for automatic pagination.
 */
module.exports.vueTable = function(req, model, strAttributes) {
  let searchOptions = search(req, strAttributes)
  let searchSortPagIncl = searchPaginate( req, strAttributes )
  let queries = []
  queries.push(model.count(searchOptions))
  queries.push(model.findAll(searchSortPagIncl))
  return Promise.all(queries).then(
    function(res) {
      let searchRes = res[0]
      let paginatedSearchRes = res[1]
      let lastPage = math.ceil(searchRes / req.query.per_page)
      return {
        data: paginatedSearchRes,
        total: searchRes,
        per_page: req.query.per_page,
        current_page: req.query.page,
        'from': (req.query.page - 1) * req.query.per_page + 1,
        'to': math.min(searchRes, req.query.page * req.query.per_page),
        last_page: lastPage,
        prev_page_url: (req.query.page == 1) ? null : prevNextPageUrl(
          req, true),
        next_page_url: (req.query.page == lastPage) ? null : prevNextPageUrl(
          req, false)
      }
    })
  }

  /**
   * modelAttributes - Return info about each column in the model's table
   *
   * @param  {Object} model Sequelize model from which the info will be given.
   * @return {Array}       Array of objects, each object contains info for each attribute in the model
   */
  modelAttributes = function(model) {
    return model.sequelize.query(
      "SELECT column_name, data_type, is_nullable, column_default " +
      "FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '" +
      model.tableName + "'", {
        type: model.sequelize.QueryTypes.SELECT
      }
    )
  }

  //attributes to discard
  discardModelAttributes = ['createdAt', 'updatedAt']

  /**
   * filterModelAttributesForCsv - Filter attributes from a given model
   *
   * @param  {Object} model        Sequelize model from which the attributes will be filtered
   * @param  {Array} discardAttrs Array of attributes to discard
   * @return {Array}              Filtered attributes
   */
  filterModelAttributesForCsv = function(model, discardAttrs) {
    discardAttrs = discardAttrs || discardModelAttributes
    modelPrimaryKey = model.primaryKeyField
    if (modelPrimaryKey)
      discardAttrs = discardAttrs.concat([modelPrimaryKey])
    return modelAttributes(model).then(function(x) {
      return x.filter(function(i) {
        return discardAttrs.indexOf(i.column_name) < 0
      })
    })
  }

  /**
   * csvTableTemplate - Returns template of model, i.e. header of each column an its type
   *
   * @param  {Object} model         Sequelize model from which the template will be returned.
   * @param  {Array} discardAttrs Attributes to discard from the template
   * @return {Array}              Array of strings, one for header and one for the attribute't type.
   */
  module.exports.csvTableTemplate = function(model, discardAttrs) {
    return filterModelAttributesForCsv(model,
      discardAttrs).then(function(x) {
      csvHeader = []
      csvExmplRow = []
      x.forEach(function(i) {
        csvStr = i.data_type
        if (i.is_nullable.toLowerCase() === 'false' || i.is_nullable.toLowerCase() ===
          'no' || i.is_nullable === 0)
          csvStr += ",required"
        if (i.column_default)
          csvStr += ",default:" + i.column_default
        csvHeader = csvHeader.concat([i.column_name])
        csvExmplRow = csvExmplRow.concat([csvStr])
      })
      return [csvHeader.join(','), csvExmplRow.join(',')]
    })
  }

  /**
   * parseOrderCursor - Parse the order options and return the where statement for cursor based pagination (forward)
   *
   * @param  {Array} order  Order options to translate to a where statement used by sequelize.
   * @param  {Object} cursor Cursor record taken as start point(exclusive) to create the where statement.
   * @param  {String} idAttribute  id attribute of the calling model.
   * @return {Object}        Where statement to start retrieving records after the given cursor holding the order conditions.
   */
  module.exports.parseOrderCursor = function(order, cursor, idAttribute){
    //check: at least one order field is expected
    if(order.length <= 0) { return {}; }

    let last_index = order.length-1;
    let start_index = order.length-2;
    
    //set operator for last-index
    let operator = order[last_index][1] === 'ASC' ? '$gte' : '$lte';
    if (order[last_index][0] === idAttribute) { operator = operator.substring(0, 3); }
    
    //add condition for last-index
    let where_statement = {
      [order[last_index][0]]: { [operator]: cursor[order[last_index][0]] }
    }

    //set the other conditions
    for( let i= start_index; i>=0; i-- ){
      operator = order[i][1] === 'ASC' ? '$gte' : '$lte';
      let strict_operator = order[i][1] === 'ASC' ? '$gt' : '$lt';
      //strict operator if we are ordering by id
      if(order[i][0] === idAttribute){ operator = operator.substring(0, 3);}
      
      where_statement = {
        ['$and'] :[
          { [order[i][0] ] : { [ operator ]: cursor[ order[i][0] ] } },
          {['$or'] : [ {[order[i][0]]: { [strict_operator]: cursor[ order[i][0] ]} } , where_statement  ] }
        ]
      }
    }
    return where_statement;
  }

  /**
   * parseOrderCursorBefore - Parse the order options and return the where statement for cursor based pagination (backward)
   *
   * @param  {Array} order  Order options to translate to a where statement used by sequelize.
   * @param  {Object} cursor Before-cursor record taken as start point(exclusive) to create the where statement
   * @param  {String} idAttribute  id attribute of the calling model.
   * @return {Object}        Where statement to start retrieving records before the given cursor holding the order conditions.
   */
  module.exports.parseOrderCursorBefore = function(order, cursor, idAttribute){
    //check: at least one order field is expected
    if(order.length <= 0) { return {}; }

    let last_index = order.length-1;
    let start_index = order.length-2;
    
    //set operator for last-index
    let operator = order[last_index][1] === 'ASC' ? '$lte' : '$gte';
    if(order[last_index][0] === idAttribute) { operator = operator.substring(0, 3); }
    
    //add condition for last-index
    let where_statement = {
      [order[last_index][0]]: { [operator]: cursor[order[last_index][0]] }
    }

    //process the other indexes
    for( let i= start_index; i>=0; i-- ){
      operator = order[i][1] === 'ASC' ? '$lte' : '$gte';
      let strict_operator = order[i][1] === 'ASC' ? '$lt' : '$gt';
      //strict operator if we are ordering by id
      if(order[i][0] === idAttribute){ operator = operator.substring(0, 3);}
      
       where_statement = {
        ['$and'] :[
          { [order[i][0] ] : { [ operator ]: cursor[ order[i][0] ] } },
          {['$or'] : [ {[order[i][0]]: { [strict_operator]: cursor[ order[i][0] ]} } , where_statement  ] }
        ]
      }
    }
    return where_statement;
  }

  module.exports.checkInverseAssociation = async function( from_model , to_model, search_model_name, foreign_key, id_toadd ){
    let result = false;

    if(from_model.name === search_model_name){
      let associated = await from_model.findOne({where:{ personId: id_toadd }});
      let exists = await to_model.findOne({where:{id: id_toadd}});
      result =  !associated && exists;
    }else{
      let exists  = await to_model.findOne({where: {id : id_toadd}});
      result =  exists && exists[foreign_key] === null;
    }

    if(!result){
      throw new Error("Item intended to associate either it doesn't exists or it's already associated");
    }

    return result;
  }

  module.exports.checkExistence = function(ids_to_add, model){

    let ids = Array.isArray(ids_to_add) ? ids_to_add : [ ids_to_add ];
    let promises = ids.map( id => { return model.countRecords({field: model.idAttribute(), value:{value: id }, operator: 'eq' })  } );


    return Promise.all(promises).then( result =>{
      return result.map( (r, index)=>{ return r === 0 ? ids[index] : false } ).filter( r =>{return r !== false});
    })

  }

  /**
   * orderedRecords - javaScript function for ordering of records based on GraphQL orderInput for local post-processing
   *
   * @param  {Array} matchingRecords  List of records to be ordered
   * @param  {Object} order GraphQL order options to be used
   * @return {Array}        order List of records
   */
  module.exports.orderRecords = function(matchingRecords, order = [{field, order}]) {
    return _.orderBy(matchingRecords,_.map(order,'field'),_.map(order,'order').map(orderArg => orderArg.toLowerCase()));
    //This could be sped up by to O(n*m), m = # of remote servers by using merge sort
  }

  /**
   * paginateRecords - post-precossing pagination of ordered records
   *
   * @param  {Array} orderedRecords  List of records to be paginated
   * @param  {Object} paginate GraphQL paginate argument
   * @return {Array}        paginated List of records
   */
  module.exports.paginateRecords = function(orderedRecords, first) {
    return orderedRecords.slice(0,first);
  }

  /**
   * toGraphQLConnectionObject - translate an array of records into a GraphQL connection
   *
   * @param  {Array} paginatedRecords List of records to be translated
   * @param  {Object} model            Record's type
   * @param  {Boolean} hasNextPage      hasNextPage parameter for pagination info
   * @return {type}                  description
   */
  module.exports.toGraphQLConnectionObject = function(paginatedRecords, model, hasNextPage) {
    let edges = paginatedRecords.map(e => {
        let temp_node = new model(e);
        return {
            node: temp_node,
            cursor: temp_node.base64Enconde()
        }
    })

    let pageInfo = {
      hasNextPage: hasNextPage,
      endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : null
    }

    return {
        edges,
        pageInfo
    };
  }
