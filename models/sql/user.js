'use strict';

const _ = require('lodash');
const Sequelize = require('sequelize');
const dict = require('../../utils/graphql-sequelize-types');
const searchArg = require('../../utils/search-argument');
const globals = require('../../config/globals');
const validatorUtil = require('../../utils/validatorUtil');
const fileTools = require('../../utils/file-tools');
const helpersAcl = require('../../utils/helpers-acl');
const email = require('../../utils/email');
const fs = require('fs');
const path = require('path');
const os = require('os');
const uuidv4 = require('uuidv4').uuid;
const helper = require('../../utils/helper');
const models = require(path.join(__dirname, '..', 'index.js'));
const moment = require('moment');
const errorHelper = require('../../utils/errors');
const bcrypt = require('bcrypt');

// An exact copy of the the model definition that comes from the .json file
const definition = {
    model: 'user',
    storageType: 'SQL',
    attributes: {
        email: 'String',
        password: 'String'
    },
    associations: {
        roles: {
            type: 'to_many_through_sql_cross_table',
            target: 'role',
            targetKey: 'roleId',
            sourceKey: 'userId',
            keysIn: 'role_to_user',
            targetStorageType: 'sql',
            label: 'name',
            sublabel: 'id'
        }
    },
    id: {
        name: 'id',
        type: 'Int'
    }
};

/**
 * module - Creates a sequelize model
 *
 * @param  {object} sequelize Sequelize instance.
 * @param  {object} DataTypes Allowed sequelize data types.
 * @return {object}           Sequelize model with associations defined
 */

module.exports = class user extends Sequelize.Model {

    static init(sequelize, DataTypes) {
        return super.init({

            email: {
                type: Sequelize[dict['String']]
            },
            password: {
                type: Sequelize[dict['String']]
            }


        }, {
            modelName: "user",
            tableName: "users",
            sequelize
        });
    }

    static associate(models) {
        user.belongsToMany(models.role, {
            as: 'roles',
            foreignKey: 'userId',
            through: 'role_to_user',
            onDelete: 'CASCADE'
        });
    }

    static async readById(id) {
        let item = await user.findByPk(id);
        if (item === null) {
            throw new Error(`Record with ID = "${id}" does not exist`);
        }
        return validatorUtil.validateData('validateAfterRead', this, item);
    }

    static async countRecords(search) {
        let options = {}
        options['where'] = helper.searchConditionsToSequelize(search);
        return super.count(options);
    }

    static async readAll(search, order, pagination, benignErrorReporter) {
        //use default BenignErrorReporter if no BenignErrorReporter defined
        benignErrorReporter = errorHelper.getDefaultBenignErrorReporterIfUndef(benignErrorReporter);
        // build the sequelize options object for limit-offset-based pagination
        let options = helper.buildLimitOffsetSequelizeOptions(search, order, pagination, this.idAttribute());
        let records = await super.findAll(options);
        // validationCheck after read
        return validatorUtil.bulkValidateData('validateAfterRead', this, records, benignErrorReporter);
    }

    static async readAllCursor(search, order, pagination, benignErrorReporter) {
        //use default BenignErrorReporter if no BenignErrorReporter defined
        benignErrorReporter = errorHelper.getDefaultBenignErrorReporterIfUndef(benignErrorReporter);

        // build the sequelize options object for cursor-based pagination
        let options = helper.buildCursorBasedSequelizeOptions(search, order, pagination, this.idAttribute());
        let records = await super.findAll(options);
        // validationCheck after read
        records = await validatorUtil.bulkValidateData('validateAfterRead', this, records, benignErrorReporter);
        // get the first record (if exists) in the opposite direction to determine pageInfo.
        // if no cursor was given there is no need for an extra query as the results will start at the first (or last) page.
        let oppRecords = [];
        if (pagination && (pagination.after !== undefined || pagination.before !== undefined)) {
            let oppOptions = helper.buildOppositeSearchSequelize(search, order, pagination, this.idAttribute());
            oppRecords = await super.findAll(oppOptions);
        }
        // build the graphql Connection Object
        let edges = helper.buildEdgeObject(records);
        let pageInfo = helper.buildPageInfo(edges, oppRecords, pagination);
        return {
            edges,
            pageInfo
        };
    }

    static async addOne(input) {
        //validate input
        await validatorUtil.validateData('validateForCreate', this, input);
        try {
            let hash = await bcrypt.hash(input.password, globals.SALT_ROUNDS);
            input.password = hash;
            const result = await this.sequelize.transaction(async (t) => {
                let item = await super.create(input, {
                    transaction: t
                });
                return item;
            });
            return result;
        } catch (error) {
            throw error;
        }

    }

    static async deleteOne(id) {
        //validate id
        await validatorUtil.validateData('validateForDelete', this, id);
        let destroyed = await super.destroy({
            where: {
                [this.idAttribute()]: id
            }
        });
        if (destroyed !== 0) {
            return 'Item successfully deleted';
        } else {
            throw new Error(`Record with ID = ${id} does not exist or could not been deleted`);
        }
    }

    static async updateOne(input) {
        //validate input
        await validatorUtil.validateData('validateForUpdate', this, input);
        try {
            //check if password wants to be updated:
            if(input.password !== undefined){
              let hash = await bcrypt.hash(input.password, globals.SALT_ROUNDS);
              input.password = hash;
            }
            let result = await this.sequelize.transaction(async (t) => {
                let updated = await super.update(input, {
                    where: {
                        [this.idAttribute()]: input[this.idAttribute()]
                    },
                    returning: true,
                    transaction: t
                });
                return updated;
            });
            if (result[0] === 0) {
                throw new Error(`Record with ID = ${input[this.idAttribute()]} does not exist`);
            }
            return result[1][0];
        } catch (error) {
            throw error;
        }

    }

    static bulkAddCsv(context) {

        let delim = context.request.body.delim;
        let cols = context.request.body.cols;
        let tmpFile = path.join(os.tmpdir(), uuidv4() + '.csv');

        context.request.files.csv_file.mv(tmpFile).then(() => {

            fileTools.parseCsvStream(tmpFile, this, delim, cols).then((addedZipFilePath) => {
                try {
                    console.log(`Sending ${addedZipFilePath} to the user.`);

                    let attach = [];
                    attach.push({
                        filename: path.basename("added_data.zip"),
                        path: addedZipFilePath
                    });

                    email.sendEmail(helpersAcl.getTokenFromContext(context).email,
                        'ScienceDB batch add',
                        'Your data has been successfully added to the database.',
                        attach).then(function(info) {
                        fileTools.deleteIfExists(addedZipFilePath);
                        console.log(info);
                    }).catch(function(err) {
                        fileTools.deleteIfExists(addedZipFilePath);
                        console.error(err);
                    });

                } catch (error) {
                    console.error(error.message);
                }

                fs.unlinkSync(tmpFile);
            }).catch((error) => {
                email.sendEmail(helpersAcl.getTokenFromContext(context).email,
                    'ScienceDB batch add', `${error.message}`).then(function(info) {
                    console.error(info);
                }).catch(function(err) {
                    console.error(err);
                });

                fs.unlinkSync(tmpFile);
            });



        }).catch((error) => {
            throw new Error(error);
        });

        return `Bulk import of user records started. You will be send an email to ${helpersAcl.getTokenFromContext(context).email} informing you about success or errors`;
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


    async rolesFilterImpl({
        search,
        order,
        pagination
    }) {
        // build the sequelize options object for limit-offset-based pagination
        let options = helper.buildLimitOffsetSequelizeOptions(search, order, pagination, models.role.idAttribute());
        return this.getRoles(options);
    }


    async rolesConnectionImpl({
        search,
        order,
        pagination
    }) {
        // build the sequelize options object for cursor-based pagination
        let options = helper.buildCursorBasedSequelizeOptions(search, order, pagination, models.role.idAttribute());
        let records = await this.getRoles(options);
        // get the first record (if exists) in the opposite direction to determine pageInfo.
        // if no cursor was given there is no need for an extra query as the results will start at the first (or last) page.
        let oppRecords = [];
        if (pagination && (pagination.after !== undefined || pagination.before !== undefined)) {
            let oppOptions = helper.buildOppositeSearchSequelize(search, order, pagination, models.role.idAttribute());
            oppRecords = await this.getRoles(oppOptions);
        }
        // build the graphql Connection Object
        let edges = helper.buildEdgeObject(records);
        let pageInfo = helper.buildPageInfo(edges, oppRecords, pagination);
        return {
            edges,
            pageInfo
        };
    }

    countFilteredRolesImpl({
        search
    }) {
        let options = {}
        options['where'] = helper.searchConditionsToSequelize(search);
        return this.countRoles(options);
    }


    /**
     * add_roleId - field Mutation (model-layer) for to_one associationsArguments to add
     *
     * @param {Id}   id   IdAttribute of the root model to be updated
     * @param {Id}   roleId Foreign Key (stored in "Me") of the Association to be updated.
     */
    static async add_roleId(record, addRoles) {
        const updated = await this.sequelize.transaction(async (transaction) => {
            return await record.addRoles(addRoles, {
                transaction: transaction
            });
        });
        return updated;
    }

    /**
     * remove_roleId - field Mutation (model-layer) for to_one associationsArguments to remove
     *
     * @param {Id}   id   IdAttribute of the root model to be updated
     * @param {Id}   roleId Foreign Key (stored in "Me") of the Association to be updated.
     */
    static async remove_roleId(record, removeRoles) {
        const updated = await this.sequelize.transaction(async (transaction) => {
            return await record.removeRoles(removeRoles, {
                transaction: transaction
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
        return user.definition.id.name;
    }

    /**
     * idAttributeType - Return the Type of the internalId.
     *
     * @return {type} Type given in the JSON model
     */
    static idAttributeType() {
        return user.definition.id.type;
    }

    /**
     * getIdValue - Get the value of the idAttribute ("id", or "internalId") for an instance of user.
     *
     * @return {type} id value
     */
    getIdValue() {
        return this[user.idAttribute()]
    }

    static get definition() {
        return definition;
    }

    static base64Decode(cursor) {
        return Buffer.from(cursor, 'base64').toString('utf-8');
    }

    base64Enconde() {
        return Buffer.from(JSON.stringify(this.stripAssociations())).toString('base64');
    }

    stripAssociations() {
        let attributes = Object.keys(user.definition.attributes);
        attributes.push('id');
        let data_values = _.pick(this, attributes);
        return data_values;
    }

    static externalIdsArray() {
        let externalIds = [];
        if (definition.externalIds) {
            externalIds = definition.externalIds;
        }

        return externalIds;
    }

    static externalIdsObject() {
        return {};
    }

}