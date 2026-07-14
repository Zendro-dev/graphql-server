const rewire = require("rewire");
const execute = rewire("graphql/execution/execute");

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}
const { isPromise } = require("graphql/jsutils/isPromise");

/**
 * Given a completed execution context and data, build the { errors, data }
 * response defined by the "Response" section of the GraphQL specification.
 */
const buildResponse = function (context, data) {
  if (isPromise(data)) {
    return data.then(function (resolved) {
      return buildResponse(context, resolved);
    });
  }
  if (context.contextValue.errors_sink.length > 0) {
    for (let err of context.contextValue.errors_sink) {
      context.errors = context.errors ? context.errors.concat(err) : [err];
    }
  }

  return context.errors.length === 0
    ? { data: data }
    : { errors: context.errors, data: data };
};

execute.__set__("buildResponse", buildResponse);
module.exports = execute;
