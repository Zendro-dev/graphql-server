const { Op } = require("sequelize");

/**
 * search Class to parse search argument for any model and translate it so sequelize model will accept it
 */
module.exports = class search {
  /**
   * constructor - Creates an instace with the given arguments
   *
   * @param  {string} field   field to filter.
   * @param  {string} value   value is the actual value to match in the filter. Must be defined.
   * @param  {string} valueType the expected value type (i.e. array, string)
   * @param  {string} operator operator used to perform the filter. Must be defined.
   * @param  {object} search  recursive search instance.
   * @return {object}          instace of search class.
   */
  constructor({ field, value, valueType, operator, search }) {
    this.field = field;
    this.value = this.constructor.parseValue(value, valueType);
    this.operator = operator;
    this.search = search;
  }

  /**
   * @static parseValue - Creates the proper type(either array or string) of the value that user wants to filter.
   *
   * @param  {object} val value object to parse.
   * @return {(array|string|number)}     Parsed value
   */
  static parseValue(val, type) {
    if (val !== undefined) {
      if (type === "Array") {
        return val.split(",");
      } else {
        return val;
      }
    }
  }

  /**
   * toSequelize - Convert recursive search instance to search object that sequelize will accept as input.
   *
   * @return {object}  Translated search instance into sequelize object format.
   */
  toSequelize(dataModelDefinition) {
    let searchsInSequelize = {};

    if (
      this.operator === undefined ||
      (this.value === undefined && this.search === undefined)
    ) {
      //there's no search-operation arguments
      return searchsInSequelize;
    } else if (this.search === undefined && this.field === undefined) {
      searchsInSequelize[Op[this.operator]] = this.value;
    } else if (this.search === undefined) {
      const strType = ["String", "Time", "DateTime", "Date"];
      let arrayType =
        dataModelDefinition[this.field] != undefined &&
        dataModelDefinition[this.field].replace(/\s+/g, "")[0] === "[";
      if (arrayType && this.operator === "contains") {
        let pattern = null;
        if (
          strType.includes(
            dataModelDefinition[this.field].replace(/\s+/g, "").slice(1, -1)
          )
        ) {
          this.value = '"' + this.value + '"';
        }
        pattern = [
          "[" + this.value + ",%",
          "%," + this.value + ",%",
          "%," + this.value + "]",
        ].map((item) => {
          return { [Op.like]: item };
        });
        pattern.push({ [Op.eq]: "[" + this.value + "]" });
        searchsInSequelize[this.field] = {
          [Op.or]: pattern,
        };
      } else if (arrayType && this.operator === "notContains") {
        let pattern = null;
        if (
          strType.includes(
            dataModelDefinition[this.field].replace(/\s+/g, "").slice(1, -1)
          )
        ) {
          this.value = '"' + this.value + '"';
        }
        pattern = [
          "[" + this.value + ",%",
          "%," + this.value + ",%",
          "%," + this.value + "]",
        ].map((item) => {
          return { [Op.notLike]: item };
        });
        pattern.push({ [Op.ne]: "[" + this.value + "]" });
        searchsInSequelize[this.field] = {
          [Op.and]: pattern,
        };
      } else {
        searchsInSequelize[this.field] = {
          [Op[this.operator]]: this.value,
        };
      }
    } else if (this.field === undefined) {
      searchsInSequelize[Op[this.operator]] = this.search.map((sa) => {
        let new_sa = new search(sa);
        return new_sa.toSequelize(dataModelDefinition);
      });
    } else {
      searchsInSequelize[this.field] = {
        [Op[this.operator]]: this.search.map((sa) => {
          let new_sa = new search(sa);
          return new_sa.toSequelize(dataModelDefinition);
        }),
      };
    }

    return searchsInSequelize;
  }

  /**
   *
   * @param {*} operator
   */
  transformMongoDbOperator(operator) {
    if (operator === undefined) {
      return;
    }
    const allowedOperators = [
      "or",
      "and",
      "not",
      "all",
      "eq",
      "ne",
      "in",
      "notIn",
      "contains",
      "notContains",
      "gt",
      "gte",
      "lt",
      "lte",
      "regexp",
      "notRegexp",
      "like",
      "notLike",
      "iLike",
      "notILike"
    ];

    if (allowedOperators.includes(operator)) {
      if (operator === "notIn") {
        return "$nin";
      } else if (operator === "regexp" || operator === "like" || operator === "iLike" || operator === "notLike" || operator === "notILike") {
        return "$regex";
      } else if (operator === "contains") {
        return "$eq";
      } else if (operator === "notContains") {
        return "$ne";
      } else {
        return "$" + operator;
      }
    } else {
      throw new Error(`Operator ${operator} not supported in MongoDB`);
    }
  }

  /**
   * toMongoDb - Convert recursive search instance to search object in MongoDb
   *
   */
   toMongoDb() {
    let searchsInMongoDb = {};
    const transformedOperator = this.transformMongoDbOperator(this.operator);

    if (
      this.operator === undefined ||
      (this.value === undefined && this.search === undefined)
    ) {
      //there's no search-operation arguments
      return searchsInMongoDb;
    } else if (this.search === undefined && this.field === undefined) {
      searchsInMongoDb[transformedOperator] = this.value;
    } else if (this.search === undefined) {
      if (this.operator === 'like' || this.operator === 'notLike') {
        const valueToRegex = `^${this.value.replace(/_/g,'.').replace(/%/g,'.*?')}$`;
        searchsInMongoDb[this.field] = {
          [transformedOperator]: valueToRegex,
        }
      } else if (this.operator === "iLike" || this.operator === "notILike" ) {
        const valueToRegex = `^${this.value.replace(/_/g,'.').replace(/%/g,'.*?')}$`;
        searchsInMongoDb[this.field] = {
          [transformedOperator]: valueToRegex,
          '$options': 'i' 
        } 
      } else {
        searchsInMongoDb[this.field] = {
          [transformedOperator]: this.value,
        };
      }
      // add $not if the operator includes "not"
      if (this.operator.includes("not")) {
        searchsInMongoDb[this.field] = {'$not': searchsInMongoDb[this.field]}
      }
    } else if (this.field === undefined) {
      searchsInMongoDb[transformedOperator] = this.search.map((sa) => {
        let new_sa = new search(sa);
        return new_sa.toMongoDb();
      });
    } else {
      searchsInMongoDb[this.field] = {
        [transformedOperator]: this.search.map((sa) => {
          let new_sa = new search(sa);
          return new_sa.toMongoDb();
        }),
      };
    }

    return searchsInMongoDb;
  }

  /**
   *
   * @param {*} operatorString
   */
  transformCassandraOperator(operatorString) {
    switch (operatorString) {
      case "eq":
        return " = ";
      case "lt":
        return " < ";
      case "gt":
        return " > ";
      case "lte":
        return " <= ";
      case "gte":
        return " >= ";
      case "in":
        return " IN ";
      case "contains":
        return " CONTAINS ";
      case "ctk":
        return " CONTAINS KEY ";
      case "tgt":
        return " > ";
      case "tget":
        return " >= ";
      // AND not supported here, because this.search is undefined if this is executed
      case "and":
        throw new Error(
          `Operator 'and' can only be used with an array of search terms`
        );
      default:
        throw new Error(`Operator ${operatorString} not supported`);
    }
  }

  /**
   * toCassandra - Convert recursive search instance to search string for use in CQL
   *
   * @param{string} idAttribute - The name of the ID attribute which isn't cast into apostrophes if it is a UUID
   * @param{boolean} allowFiltering - Set 'ALLOW FILTERING'
   *
   * @returns{string} Translated search instance into CQL string
   */
   toCassandra(attributesDefinition, allowFiltering) {
    let searchsInCassandra = "";
    let type = attributesDefinition[this.field];
    if (
      this.operator === undefined ||
      (this.value === undefined && this.search === undefined)
    ) {
      //there's no search-operation arguments
      return searchsInCassandra;
    } else if (this.search === undefined && this.field === undefined) {
      searchsInCassandra =
        this.transformCassandraOperator(this.operator) + this.value;
    } else if (
      this.search === undefined &&
      (this.operator === "tgt" || this.operator === "tget")
    ) {
      let op = this.transformCassandraOperator(this.operator);
      searchsInCassandra = `token("${this.field}") ${op} token('${this.value}')`;
    } else if (this.search === undefined) {
      let value = this.value;
      if (type.includes("String") || type.includes("Date")) {
        value = `'${this.value}'`;
      }
      if (Array.isArray(this.value)) {
        if (type.includes("String") || type.includes("Date")) {
          value = `(${this.value.map((e) => `'${e}'`)})`;
        } else {
          value = `(${this.value.map((e) => `${e}`)})`;
        }
      }
      searchsInCassandra =
        `"${this.field}"` +
        this.transformCassandraOperator(this.operator) +
        value;
    } else if (this.operator === "and") {
      searchsInCassandra = this.search
        .map((singleSearch) =>
          new search(singleSearch).toCassandra(attributesDefinition)
        )
        .join(" and ");
    } else {
      throw new Error(
        "Statement not supported by CQL:\n" + JSON.stringify(this, null, 2)
      );
    }

    if (allowFiltering) {
      searchsInCassandra += " ALLOW FILTERING";
    }

    return searchsInCassandra;
  }

  /**
   *
   * @param {*} operator
   */
  transformAmazonS3Operator(operator) {
    if (operator === undefined) {
      return;
    }
    switch (operator) {
      case "eq":
        return " = ";
      case "ne":
        return " != ";
      case "lt":
        return " < ";
      case "gt":
        return " > ";
      case "lte":
        return " <= ";
      case "gte":
        return " >= ";
      case "regexp": 
        return "regexp_like";
      case "iLike": 
        return "like";
      case "like":
      case "and":
      case "or":
      case "not":
      case "between":
      case "in":
        return ` ${operator.toUpperCase()} `;
      default:
        throw new Error(`Operator ${operator} is not supported`);
    }
  }

  /**
   * toAmazonS3 - Convert recursive search instance to search string for use in SQL
   *
   * @param{string} idAttribute - The name of the ID attribute
   *
   * @returns{string} Translated search instance
   */
   toAmazonS3(dataModelDefinition, arrayDelimiter, storageType = "AmazonS3") {
    let searchsInAmazonS3 = "";
    let type = dataModelDefinition[this.field];
    const transformedOperator = this.transformAmazonS3Operator(this.operator);
    const stringType = ["String", "Date", "DateTime", "Time"];
    const logicOperaters = ["and", "or", "not"];
    if (
      this.operator === undefined ||
      (this.value === undefined && this.search === undefined)
    ) {
      return searchsInAmazonS3;
    } else if (this.search === undefined && this.field === undefined) {
      searchsInAmazonS3 = transformedOperator + this.value;
    } else if (this.search === undefined) {
      let arrayType = type != undefined && type.replace(/\s+/g, "")[0] === "[";
      const pattern =
        storageType === "AmazonS3"
          ? [
              `'${this.value}${arrayDelimiter}%'`,
              `'%${arrayDelimiter}${this.value}${arrayDelimiter}%'`,
              `'%${arrayDelimiter}${this.value}'`,
            ]
          : stringType.includes(type.replace(/\s+/g, "").slice(1, -1))
          ? [
              `'["${this.value}",%'`,
              `'%,"${this.value}",%'`,
              `'%,"${this.value}"]'`,
            ]
          : [`'[${this.value},%'`, `'%,${this.value},%'`, `'%,${this.value}]'`];
      let value = this.value;
      if (arrayType && this.operator === "contains") {
        value = `'${this.value}'`;
        searchsInAmazonS3 += pattern
          .map((item) => {
            return ` ${this.field} LIKE ${item} `;
          })
          .join(" OR ");
        searchsInAmazonS3 += ` OR ${this.field} = ${value} `;
      } else if (arrayType && this.operator === "notContains") {
          value = `'${this.value}'`;
          searchsInAmazonS3 += pattern
            .map((item) => {
              return ` ${this.field} NOT LIKE ${item} `;
            })
            .join(" OR ");
          searchsInAmazonS3 += ` OR ${this.field} = ${value} `;
      } else {
        if (Array.isArray(value)) {
          if (
            stringType.includes(type) ||
            stringType.includes(type.replace(/\s+/g, "").slice(1, -1))
          ) {
            value =
              this.operator === "in" || this.operator === "notIn"
                ? `(${value.map((e) => `'${e}'`)})`
                : storageType === "AmazonS3"
                ? `'${value.join(arrayDelimiter)}'`
                : `'[${value.map((e) => `"${e}"`)}]'`;
          } else {
            value =
              this.operator === "in" || this.operator === "notIn"
                ? `(${value.map((e) => `${e}`)})`
                : storageType === "AmazonS3"
                ? `'${value.join(arrayDelimiter)}'`
                : `'[${value.map((e) => `${e}`)}]'`;
          }
        } else {
          if (stringType.includes(type) || arrayType) {
            value = `'${value}'`;
          }
        }
        if (this.operator === 'regexp') {
          searchsInAmazonS3 = `${transformedOperator}(${this.field}, ${value})` 
        } else if (this.operator === 'notRegexp') {
          searchsInAmazonS3 = `NOT ${transformedOperator}(${this.field}, ${value})`
        } else if (this.operator === 'iLike') {
          searchsInAmazonS3 = `LOWER(${this.field}) ${transformedOperator} LOWER(${value})`
        } else if (this.operator === 'notILike') {
          searchsInAmazonS3 = `NOT LOWER(${this.field}) ${transformedOperator} LOWER(${value})`
        } else if (this.operator === 'notLike' || this.operator === 'notIn') {
          searchsInAmazonS3 = "NOT " + this.field + transformedOperator + value; 
        } else {
          searchsInAmazonS3 = this.field + transformedOperator + value;
        }
      }
    } else if (logicOperaters.includes(this.operator)) {
      if (this.operator === "not") {
        let new_search = new search(this.search[0]);
        searchsInAmazonS3 =
          transformedOperator +
          "(" +
          new_search.toAmazonS3(
            dataModelDefinition,
            arrayDelimiter,
            storageType
          ) +
          ")";
      } else {
        searchsInAmazonS3 = this.search
          .map((singleSearch) =>
            new search(singleSearch).toAmazonS3(
              dataModelDefinition,
              arrayDelimiter,
              storageType
            )
          )
          .join(transformedOperator);
      }
    } else {
      throw new Error(
        "Statement not supported by AmazonS3:\n" + JSON.stringify(this, null, 2)
      );
    }

    return searchsInAmazonS3;
  }

  /**
   *
   * @param {*} operator
   */
  transformNeo4jOperator(operator) {
    if (operator === undefined) {
      return;
    }
    switch (operator) {
      case "eq":
        return " = ";
      case "ne":
        return " <> ";
      case "lt":
        return " < ";
      case "gt":
        return " > ";
      case "lte":
        return " <= ";
      case "gte":
        return " >= ";
      case "like":
      case "notLike":  
      case "iLike":
      case "notILike":
      case "regexp":
      case "notRegexp":
        return " =~ ";
      case "contains":
      case "notContains":
        return " IN "
      case "and":
      case "or":
      case "not":
      case "in":
        return ` ${operator.toUpperCase()} `;
      default:
        throw new Error(`Operator ${operator} is not supported`);
    }
  }
  
  /**
   * toNeo4j - Convert recursive search instance to search string for use in Cypher
   *
   * @param{string} idAttribute - The name of the ID attribute
   *
   * @returns{string} Translated search instance
   */
  toNeo4j(dataModelDefinition) {
    let searchsInNeo4j = "";
    let type = dataModelDefinition[this.field];
    const transformedOperator = this.transformNeo4jOperator(this.operator);
    const stringType = ["String", "Date", "DateTime", "Time"];
    const logicOperaters = ["and", "or", "not"];
    if (
      this.operator === undefined ||
      (this.value === undefined && this.search === undefined)
    ) {
      return searchsInNeo4j;
    } else if (this.search === undefined && this.field === undefined) {
      searchsInNeo4j = transformedOperator + this.value;
    } else if (this.search === undefined) {
      let arrayType = type != undefined && type.replace(/\s+/g, "")[0] === "[";
      let value = this.value;
      if (Array.isArray(value)) {
        if (
          stringType.includes(type) ||
          stringType.includes(type.replace(/\s+/g, "").slice(1, -1))
        ) {
          value = `[${value.map((e) => `"${e}"`)}]`;
        } else {
          value = `[${value.map((e) => `${e}`)}]`;
        }
      } else {
        if (
          stringType.includes(type) ||
          stringType.includes(type.replace(/\s+/g, "").slice(1, -1))
        ) {
          value = `'${value}'`;
        }
      }
      if (arrayType && this.operator === "contains") {
        console.log(this.value)
        searchsInNeo4j = Array.isArray(this.value)
          ? "ALL(x IN " + value + " WHERE x IN n." + this.field + ")"
          : value + " IN n." + this.field;
      } else if (this.operator === "notContains") {
        searchsInNeo4j = Array.isArray(this.value)
        ? "NOT ALL(x IN " + value + " WHERE x IN n." + this.field + ")"
        : "NOT " + value + " IN n." + this.field;
      } else if (this.operator === "in") {
        searchsInNeo4j = value + " IN n." + this.field;
      } else if(this.operator === "notIn") {
        searchsInNeo4j = "NOT " + value + " IN n." + this.field; 
      } else {
        // add a NOT if operator is notLike, notILike, notRegexp
        const negator = this.operator.includes("not") ? "NOT" : "";
        // eq: array data = array value
        // in: primitive data in array value
        if (this.operator === 'like' || this.operator === 'notLike') {
          value = `^${value.replace(/_/g,'.').replace(/%/g,'.*?')}$`;
        } else if (this.operator === 'iLike' || this.operator === 'notILike') {
          value =`(?i)^${value.replace(/_/g,'.').replace(/%/g,'.*?')}$`; 
        }
        searchsInNeo4j = negator + "n." + this.field + transformedOperator + value;
      }
    } else if (logicOperaters.includes(this.operator)) {
      if (this.operator === "not") {
        let new_search = new search(this.search[0]);
        searchsInNeo4j =
          transformedOperator + "(" + new_search.toNeo4j(dataModelDefinition);
      } else {
        searchsInNeo4j = this.search
          .map((singleSearch) =>
            new search(singleSearch).toNeo4j(dataModelDefinition)
          )
          .join(transformedOperator);
      }
    } else {
      throw new Error(
        "Statement not supported by Neo4j:\n" + JSON.stringify(this, null, 2)
      );
    }

    return searchsInNeo4j;
  }
};
