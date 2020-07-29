
const { Op } = require("sequelize");

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
  constructor({field, value, valueType, operator, search}){
    this.field = field;
    this.value = this.constructor.parseValue(value, valueType);
    this.operator = operator;
    this.search = search
  }


  /**
   * @static parseValue - Creates the proper type(either array or string) of the value that user wants to filter.
   *
   * @param  {object} val value object to parse.
   * @return {(array|string|number)}     Parsed value
   */
  static parseValue(val, type){
    if(val !== undefined)
    {
      if(type === "Array")
      {
        return val.split(",");
      }else{
        return val;
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
      searchsInSequelize[Op[this.operator]] = this.value;

    }else if(this.search === undefined){
      searchsInSequelize[this.field] = {
         [Op[this.operator]] : this.value
      };

    }else if(this.field === undefined){
      searchsInSequelize[Op[this.operator]] = this.search.map(sa => {
        let new_sa = new search(sa);
        return new_sa.toSequelize();
      });

    }else{
       searchsInSequelize[this.field] = {
         [Op[this.operator]] : this.search.map(sa => {
           let new_sa = new search(sa);
           return new_sa.toSequelize();
         })
       }
    }

    return searchsInSequelize;
  }
};
