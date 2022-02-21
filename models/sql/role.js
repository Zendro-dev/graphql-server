"use strict";

const _ = require("lodash");
const Sequelize = require("sequelize");
const dict = require("../../utils/graphql-sequelize-types");
const searchArg = require("../../utils/search-argument");
const globals = require("../../config/globals");
const validatorUtil = require("../../utils/validatorUtil");
const fileTools = require("../../utils/file-tools");
const helpersAcl = require("../../utils/helpers-acl");
const email = require("../../utils/email");
const fs = require("fs");
const path = require("path");
const os = require("os");
const uuidv4 = require("uuidv4").uuid;
const helper = require("../../utils/helper");
const models = require(path.join(__dirname, "..", "index.js"));
const moment = require("moment");
const errorHelper = require("../../utils/errors");
// An exact copy of the the model definition that comes from the .json file
const definition = {
  model: "role",
  storageType: "SQL",
  attributes: {
    name: "String",
    description: "String",
  },
  associations: {
    users: {
      type: "many_to_many",
      implementation: "sql_cross_table",
      reverseAssociation: "roles",
      target: "user",
      targetKey: "userId",
      sourceKey: "roleId",
      keysIn: "role_to_user",
      targetStorageType: "sql",
      label: "email",
      sublabel: "id",
    },
  },
  id: {
    name: "id",
    type: "Int",
  },
};
const DataLoader = require("dataloader");

/**
 * module - Creates a sequelize model
 */

module.exports = class role extends Sequelize.Model {
  /**
   * Initialize sequelize model.
   * @param  {object} sequelize Sequelize instance.
   * @param  {object} DataTypes Allowed sequelize data types.
   * @return {object}           Sequelize model with associations defined
   */
  static init(sequelize, DataTypes) {
    return super.init(
      {
        name: {
          type: Sequelize[dict["String"]],
        },
        description: {
          type: Sequelize[dict["String"]],
        },
      },
      {
        modelName: "role",
        tableName: "roles",
        sequelize,
      }
    );
  }

  /**
   * Get the storage handler, which is a static property of the data model class.
   * @returns sequelize.
   */
  get storageHandler() {
    return this.sequelize;
  }

  /**
   * Cast array to JSON string for the storage.
   * @param  {object} record  Original data record.
   * @return {object}         Record with JSON string if necessary.
   */
  static preWriteCast(record) {
    for (let attr in definition.attributes) {
      let type = definition.attributes[attr].replace(/\s+/g, "");
      if (
        type[0] === "[" &&
        record[attr] !== undefined &&
        record[attr] !== null
      ) {
        record[attr] = JSON.stringify(record[attr]);
      }
    }
    return record;
  }

  /**
   * Cast JSON string to array for the validation.
   * @param  {object} record  Record with JSON string if necessary.
   * @return {object}         Parsed data record.
   */
  static postReadCast(record) {
    for (let attr in definition.attributes) {
      let type = definition.attributes[attr].replace(/\s+/g, "");
      if (
        type[0] === "[" &&
        record[attr] !== undefined &&
        record[attr] !== null
      ) {
        record[attr] = JSON.parse(record[attr]);
      }
    }
    return record;
  }

  /**
   * Associate models.
   * @param  {object} models  Indexed models.
   */
  static associate(models) {
    role.belongsToMany(models.user, {
      as: "users",
      foreignKey: "roleId",
      through: "role_to_user",
      onDelete: "CASCADE",
    });
  }

  /**
   * Batch function for readById method.
   * @param  {array} keys  keys from readById method
   * @return {array}       searched results
   */
  static async batchReadById(keys) {
    let queryArg = {
      operator: "in",
      field: role.idAttribute(),
      value: keys.join(),
      valueType: "Array",
    };
    let cursorRes = await role.readAllCursor(queryArg);
    cursorRes = cursorRes.roles.reduce(
      (map, obj) => ((map[obj[role.idAttribute()]] = obj), map),
      {}
    );
    return keys.map(
      (key) =>
        cursorRes[key] || new Error(`Record with ID = "${key}" does not exist`)
    );
  }

  static readByIdLoader = new DataLoader(role.batchReadById, {
    cache: false,
  });

  /**
   * readById - The model implementation for reading a single record given by its ID
   *
   * Read a single record by a given ID
   * @param {string} id - The ID of the requested record
   * @return {object} The requested record as an object with the type role, or an error object if the validation after reading fails
   * @throws {Error} If the requested record does not exist
   */
  static async readById(id) {
    return await role.readByIdLoader.load(id);
  }
  /**
   * countRecords - The model implementation for counting the number of records, possibly restricted by a search term
   *
   * This method is the implementation for counting the number of records that fulfill a given condition, or for all records in the table.
   * @param {object} search - The search term that restricts the set of records to be counted - if undefined, all records in the table
   * @param {BenignErrorReporter} benignErrorReporter can be used to generate the standard
   * @return {number} The number of records that fulfill the condition, or of all records in the table
   */
  static async countRecords(search) {
    let options = {};
    options["where"] = helper.searchConditionsToSequelize(
      search,
      role.definition.attributes
    );
    return super.count(options);
  }

  /**
   * readAll - The model implementation for searching for records in MongoDB. This method uses limit-offset-based pagination.
   *
   * @param  {object} search - Search argument for filtering records
   * @param  {array} order - Type of sorting (ASC, DESC) for each field
   * @param  {object} pagination - Offset and limit to get the records from and to respectively
   * @param  {BenignErrorReporter} - benignErrorReporter can be used to generate the standard
   * @return {array}  Array of records holding conditions specified by search, order and pagination argument
   */
  static async readAll(search, order, pagination, benignErrorReporter) {
    // build the sequelize options object for limit-offset-based pagination
    let options = helper.buildLimitOffsetSequelizeOptions(
      search,
      order,
      pagination,
      this.idAttribute(),
      role.definition.attributes
    );
    let records = await super.findAll(options);
    records = records.map((x) => role.postReadCast(x));
    // validationCheck after read
    return validatorUtil.bulkValidateData(
      "validateAfterRead",
      this,
      records,
      benignErrorReporter
    );
  }

  /**
   * readAllCursor - The model implementation for searching for records. This method uses cursor based pagination.
   *
   * @param {object} search - The search condition for which records shall be fetched
   * @param  {array} order - Type of sorting (ASC, DESC) for each field
   * @param {object} pagination - The parameters for pagination, which can be used to get a subset of the requested record set.
   * @param {BenignErrorReporter} benignErrorReporter can be used to generate the standard
   * @return {object} The set of records, possibly constrained by pagination, with full cursor information for all records
   */
  static async readAllCursor(search, order, pagination, benignErrorReporter) {
    // build the sequelize options object for cursor-based pagination
    let options = helper.buildCursorBasedSequelizeOptions(
      search,
      order,
      pagination,
      this.idAttribute(),
      role.definition.attributes
    );
    let records = await super.findAll(options);

    records = records.map((x) => role.postReadCast(x));

    // validationCheck after read
    records = await validatorUtil.bulkValidateData(
      "validateAfterRead",
      this,
      records,
      benignErrorReporter
    );
    // get the first record (if exists) in the opposite direction to determine pageInfo.
    // if no cursor was given there is no need for an extra query as the results will start at the first (or last) page.
    let oppRecords = [];
    if (pagination && (pagination.after || pagination.before)) {
      let oppOptions = helper.buildOppositeSearchSequelize(
        search,
        order,
        {
          ...pagination,
          includeCursor: false,
        },
        this.idAttribute(),
        role.definition.attributes
      );
      oppRecords = await super.findAll(oppOptions);
    }
    // build the graphql Connection Object
    let edges = helper.buildEdgeObject(records);
    let pageInfo = helper.buildPageInfo(edges, oppRecords, pagination);
    return {
      edges,
      pageInfo,
      roles: edges.map((edge) => edge.node),
    };
  }

  /**
   * addOne - The model implementation method for adding a record.
   *
   * @param {object} input - The input object.
   * @return {object} The created record
   * @throw {Error} If the process fails, an error is thrown
   */
  static async addOne(input) {
    //validate input
    await validatorUtil.validateData("validateForCreate", this, input);
    input = role.preWriteCast(input);
    try {
      const result = await this.sequelize.transaction(async (t) => {
        let item = await super.create(input, {
          transaction: t,
        });
        return item;
      });
      role.postReadCast(result.dataValues);
      role.postReadCast(result._previousDataValues);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * deleteOne - The model implementation for deleting a single record, given by its ID.
   *
   * @param {string} id - The ID of the record to be deleted
   * @returns {string} A success message is returned
   * @throw {Error} If the record could not be deleted - this means a record with the ID is still present
   */
  static async deleteOne(id) {
    //validate id
    await validatorUtil.validateData("validateForDelete", this, id);
    let destroyed = await super.destroy({
      where: {
        [this.idAttribute()]: id,
      },
    });
    if (destroyed !== 0) {
      return "Item successfully deleted";
    } else {
      throw new Error(
        `Record with ID = ${id} does not exist or could not been deleted`
      );
    }
  }

  /**
   * updateOne - The model implementation for updating a single record.
   *
   * @param {object} input - The input object.
   * @returns {object} The updated record
   * @throw {Error} If this method fails, an error is thrown
   */
  static async updateOne(input) {
    //validate input
    await validatorUtil.validateData("validateForUpdate", this, input);
    input = role.preWriteCast(input);
    try {
      let result = await this.sequelize.transaction(async (t) => {
        let to_update = await super.findByPk(input[this.idAttribute()]);
        if (to_update === null) {
          throw new Error(
            `Record with ID = ${input[this.idAttribute()]} does not exist`
          );
        }

        let updated = await to_update.update(input, {
          transaction: t,
        });
        return updated;
      });
      role.postReadCast(result.dataValues);
      role.postReadCast(result._previousDataValues);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * bulkAddCsv - Add records from csv file
   *
   * @param  {object} context - contextual information, e.g. csv file, record delimiter and column names.
   */
  static bulkAddCsv(context) {
    let delim = context.request.body.delim;
    let cols = context.request.body.cols;
    let tmpFile = path.join(os.tmpdir(), uuidv4() + ".csv");

    context.request.files.csv_file
      .mv(tmpFile)
      .then(() => {
        fileTools
          .parseCsvStream(tmpFile, this, delim, cols)
          .then((addedZipFilePath) => {
            try {
              console.log(`Sending ${addedZipFilePath} to the user.`);

              let attach = [];
              attach.push({
                filename: path.basename("added_data.zip"),
                path: addedZipFilePath,
              });

              email
                .sendEmail(
                  helpersAcl.getTokenFromContext(context).email,
                  "ScienceDB batch add",
                  "Your data has been successfully added to the database.",
                  attach
                )
                .then(function (info) {
                  fileTools.deleteIfExists(addedZipFilePath);
                  console.log(info);
                })
                .catch(function (err) {
                  fileTools.deleteIfExists(addedZipFilePath);
                  console.error(err);
                });
            } catch (error) {
              console.error(error.message);
            }

            fs.unlinkSync(tmpFile);
          })
          .catch((error) => {
            email
              .sendEmail(
                helpersAcl.getTokenFromContext(context).email,
                "ScienceDB batch add",
                `${error.message}`
              )
              .then(function (info) {
                console.error(info);
              })
              .catch(function (err) {
                console.error(err);
              });

            fs.unlinkSync(tmpFile);
          });
      })
      .catch((error) => {
        throw new Error(error);
      });

    return `Bulk import of role records started. You will be send an email to ${
      helpersAcl.getTokenFromContext(context).email
    } informing you about success or errors`;
  }

  /**
   * csvTableTemplate - Allows the user to download a template in CSV format with the
   * properties and types of this model.
   *
   * @param {BenignErrorReporter} benignErrorReporter can be used to generate the standard
   * GraphQL output {error: ..., data: ...}. If the function reportError of the benignErrorReporter
   * is invoked, the server will include any so reported errors in the final response, i.e. the
   * GraphQL response will have a non empty errors property.
   */
  static async csvTableTemplate(benignErrorReporter) {
    return helper.csvTableTemplate(definition);
  }

  /**
   * usersFilterImpl - The model implementation for searching associated records. This method uses limit-offset based pagination.
   *
   * @param {object} search - The search condition for which records shall be fetched
   * @param  {array} order - Type of sorting (ASC, DESC) for each field
   * @param {object} pagination - The parameters for pagination, which can be used to get a subset of the requested record set
   * @return {object} The set of records
   */
  async usersFilterImpl({ search, order, pagination }) {
    // build the sequelize options object for limit-offset-based pagination
    let options = helper.buildLimitOffsetSequelizeOptions(
      search,
      order,
      pagination,
      models.user.idAttribute(),
      models.user.definition.attributes
    );
    return this.getUsers(options);
  }

  /**
   * usersConnectionImpl - The model implementation for searching associated records. This method uses cursor based pagination.
   *
   * @param {object} search - The search condition for which records shall be fetched
   * @param  {array} order - Type of sorting (ASC, DESC) for each field
   * @param {object} pagination - The parameters for pagination, which can be used to get a subset of the requested record set
   * @return {object} The set of records
   */
  async usersConnectionImpl({ search, order, pagination }) {
    // build the sequelize options object for cursor-based pagination
    let options = helper.buildCursorBasedSequelizeOptions(
      search,
      order,
      pagination,
      models.user.idAttribute(),
      models.user.definition.attributes
    );
    let records = await this.getUsers(options);
    // get the first record (if exists) in the opposite direction to determine pageInfo.
    // if no cursor was given there is no need for an extra query as the results will start at the first (or last) page.
    let oppRecords = [];
    if (pagination && (pagination.after || pagination.before)) {
      let oppOptions = helper.buildOppositeSearchSequelize(
        search,
        order,
        {
          ...pagination,
          includeCursor: false,
        },
        models.user.idAttribute(),
        models.user.definition.attributes
      );
      oppRecords = await this.getUsers(oppOptions);
    }
    // build the graphql Connection Object
    let edges = helper.buildEdgeObject(records);
    let pageInfo = helper.buildPageInfo(edges, oppRecords, pagination);
    let nodes = edges.map((edge) => edge.node);
    return {
      edges,
      pageInfo,
      users: nodes,
    };
  }

  /**
   * countFilteredUsersImpl - The model implementation for counting the number of associated records
   *
   * This method is the implementation for counting the number of records that fulfill a given condition, or for all records in the table.
   * @param {object} search - The search term that restricts the set of records to be counted - if undefined, all records in the table
   * @param {BenignErrorReporter} benignErrorReporter can be used to generate the standard
   * @return {number} The number of records that fulfill the condition, or of all records in the table
   */
  countFilteredUsersImpl({ search }) {
    let options = {};
    options["where"] = helper.searchConditionsToSequelize(search);
    return this.countUsers(options);
  }

  /**
   * add_userId - field Mutation (model-layer) for to_one associationsArguments to add
   *
   * @param {Id}   id   IdAttribute of the root model to be updated
   * @param {Id}   userId Foreign Key (stored in "Me") of the Association to be updated.
   */
  static async add_userId(record, addUsers) {
    const updated = await this.sequelize.transaction(async (transaction) => {
      return await record.addUsers(addUsers, {
        transaction: transaction,
      });
    });
    return updated;
  }

  /**
   * remove_userId - field Mutation (model-layer) for to_one associationsArguments to remove
   *
   * @param {Id}   id   IdAttribute of the root model to be updated
   * @param {Id}   userId Foreign Key (stored in "Me") of the Association to be updated.
   */
  static async remove_userId(record, removeUsers) {
    const updated = await this.sequelize.transaction(async (transaction) => {
      return await record.removeUsers(removeUsers, {
        transaction: transaction,
      });
    });
    return updated;
  }

  /**
   * idAttribute - Check whether an attribute "internalId" is given in the JSON model. If not the standard "id" is used instead.
   *
   * @return {type} Name of the attribute that functions as an internalId
   */
  static idAttribute() {
    return role.definition.id.name;
  }

  /**
   * idAttributeType - Return the Type of the internalId.
   *
   * @return {type} Type given in the JSON model
   */
  static idAttributeType() {
    return role.definition.id.type;
  }

  /**
   * getIdValue - Get the value of the idAttribute ("id", or "internalId") for an instance of role.
   *
   * @return {type} id value
   */
  getIdValue() {
    return this[role.idAttribute()];
  }

  /**
   * definition - Getter for the attribute 'definition'
   * @return {string} the definition string
   */
  static get definition() {
    return definition;
  }

  /**
   * base64Decode - Decode a base 64 String to UTF-8.
   * @param {string} cursor - The cursor to be decoded into the record, given in base 64
   * @return {string} The stringified object in UTF-8 format
   */
  static base64Decode(cursor) {
    return Buffer.from(cursor, "base64").toString("utf-8");
  }

  /**
   * base64Encode - Encode  role to a base 64 String
   *
   * @return {string} The role object, encoded in a base 64 String
   */
  base64Encode() {
    return Buffer.from(JSON.stringify(this.stripAssociations())).toString(
      "base64"
    );
  }

  /**
   * asCursor - alias method for base64Encode
   *
   * @return {string} The role object, encoded in a base 64 String
   */
  asCursor() {
    return this.base64Encode();
  }

  /**
   * stripAssociations - Instance method for getting all attributes of role.
   *
   * @return {object} The attributes of role in object form
   */
  stripAssociations() {
    let attributes = Object.keys(role.definition.attributes);
    attributes.push("id");
    let data_values = _.pick(this, attributes);
    return data_values;
  }

  /**
   * externalIdsArray - Get all attributes of role that are marked as external IDs.
   *
   * @return {Array<String>} An array of all attributes of role that are marked as external IDs
   */
  static externalIdsArray() {
    let externalIds = [];
    if (definition.externalIds) {
      externalIds = definition.externalIds;
    }

    return externalIds;
  }

  /**
   * externalIdsObject - Get all external IDs of role.
   *
   * @return {object} An object that has the names of the external IDs as keys and their types as values
   */
  static externalIdsObject() {
    return {};
  }
};
