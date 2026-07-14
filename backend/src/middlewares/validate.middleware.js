import { ZodError } from 'zod';
import ApiError from '../utils/ApiError.js';

/**
 * Validates and COERCES req.body / req.query / req.params against a zod schema.
 * The parsed (coerced, stripped) value replaces the raw one, so controllers
 * always see typed, whitelisted input.
 *
 *   router.post('/', validate({ body: createUserSchema }), controller)
 */
const validate = (schemas) => (req, _res, next) => {
  try {
    for (const source of ['body', 'query', 'params']) {
      const schema = schemas[source];
      if (!schema) continue;
      const parsed = schema.parse(req[source]);
      // req.query is a getter-only property on Express 5; assign field-by-field.
      if (source === 'query') {
        Object.keys(req.query).forEach((key) => delete req.query[key]);
        Object.assign(req.query, parsed);
      } else {
        req[source] = parsed;
      }
    }
    return next();
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.errors.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(ApiError.unprocessable('Validation failed', details));
    }
    return next(error);
  }
};

export default validate;
