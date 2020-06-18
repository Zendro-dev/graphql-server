const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, useDefault: true, verbose: true });
const uuidSchema = { type: 'string', format: 'uuid' };

/**
 * search Class to parse search argument for any model and translate it so sequelize model will accept it
 */
module.exports = class search{


  /**
   * constructor - Creates an instace with the given arguments
   *
   * @param  {string} field   field to filter.
   * @param  {object} value    value contains type(i.e. array, string) and actual value to match in the filter. Must be defined.
   * @param  {string} operator operator used to perform the filter. Must be defined.
   * @param  {object} search  recursive search instance.
   * @return {object}          instace of search class.
   */
  constructor({field, value, operator, search}){
    this.field = field;
    this.value = this.constructor.parseValue(value);
    this.operator = operator;
    this.search = search
  }


  /**
   * @static parseValue - Creates the proper type(either array or string) of the value that user wants to filter.
   *
   * @param  {object} val value object to parse.
   * @return {(array|string|number)}     Parsed value
   */
  static parseValue(val){
    if(val!==undefined)
    {
      if(val.type === "Array")
      {
        return val.value.split(",");
      }else{
        return val.value;
      }
    }
  }


  /**
   * toSequelize - Convert recursive search instance to search object that sequelize will accept as input.
   *
   * @return {object}  Translated search instance into sequelize object format.
   */
  toSequelize(){
    let searchsInSequelize = {};

    if((this.operator === undefined || (this.value === undefined && this.search === undefined))){
      //there's no search-operation arguments
      return searchsInSequelize;

    } else if(this.search === undefined && this.field === undefined){
      searchsInSequelize['$'+this.operator] = this.value;

    }else if(this.search === undefined){
      searchsInSequelize[this.field] = {
         ['$'+this.operator] : this.value
      };

    }else if(this.field === undefined){
      searchsInSequelize['$'+this.operator] = this.search.map(sa => {
        let new_sa = new search(sa);
        return new_sa.toSequelize();
      });
      
    }else{
       searchsInSequelize[this.field] = {
         ['$'+this.operator] : this.search.map(sa => {
           let new_sa = new search(sa);
           return new_sa.toSequelize();
         })
       }
    }

    return searchsInSequelize;
  }

  transformCassandraOperator(operatorString) {
    switch (operatorString) {
      case 'eq': return ' = ';
      case 'lt': return ' < ';
      case 'gt': return ' > ';
      case 'le': return ' <= ';
      case 'ge': return ' >= ';
      case '_in': return ' IN ';
      case 'cont': return ' CONTAINS ';
      case 'ctk': return ' CONTAINS KEY ';
      // AND not supported here, because this.search is undefined if this is executed
      case 'and': throw new Error(`Operator 'and' can only be used with an array of search terms`);
      default: throw new Error(`Operator ${operatorString} not supported`);
    }
  }

  /**
   * toCassandra - Convert recursive search instance to search string for use in CQL
   * 
   * @param{string} idAttribute - The name of the ID attribute which isn't cast into apostrophes if it is a UUID
   * 
   * @returns{string} Translated search instance into CQL string
   */
  toCassandra(idAttribute){
    let searchsInCassandra = '';

    if((this.operator === undefined || (this.value === undefined && this.search === undefined))){
      //there's no search-operation arguments
      return searchsInCassandra;
    } else if(this.search === undefined && this.field === undefined) {
      searchsInCassandra = this.transformCassandraOperator(this.operator) + this.value;
    } else if(this.search === undefined) {
      let validate = ajv.validate(uuidSchema, this.value.toString());
      let value = this.value;
      if (this.field !== idAttribute && validate) {
        value = `'${this.value.toString()}'`;
      } 
      searchsInCassandra = this.field + this.transformCassandraOperator(this.operator) + value;
    } else if (this.operator === 'and') {
      searchsInCassandra = search.join(' and ');
    } else {
      throw new Error('Statement not supported by CQL:\n' + JSON.stringify(this, null, 2));
    }

    return 'WHERE ' +  searchsInCassandra;
  }
};
