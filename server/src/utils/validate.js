/**
 * 步骤 1-10: Joi 参数校验 schemas + 校验中间件
 *
 * 用法 (在路由中):
 *   const { validate, schemas } = require('../utils/validate');
 *   router.post('/login', validate(schemas.auth.login), handler);
 *   router.get('/', validate(schemas.partTypes.list, 'query'), handler);
 */
const Joi = require('joi');

// ========== 通用规则 ==========

const page = Joi.number().integer().min(1).default(1);
const pageSize = Joi.number().integer().min(1).max(100).default(20);
const validRoles = Joi.array()
  .items(Joi.string().valid('admin', 'manager', 'operator'))
  .min(1)
  .custom((value, helpers) => {
    // 互斥校验：'admin' 或 'manager' 存在时，不能存在 'operator'
    const hasHighRole = value.includes('admin') || value.includes('manager');
    const hasOperator = value.includes('operator');
    if (hasHighRole && hasOperator) {
      return helpers.message('角色互斥：管理员(admin)或主管(manager)不能同时是操作员(operator)');
    }
    return value;
  });
const validCondition = Joi.string().valid('全新', '利旧/返还');
const validValueType = Joi.string().valid('高价值', '低价值');
const objectIdPattern = /^[0-9a-fA-F]{24}$/;

// ========== Schemas 按模块组织 ==========

const schemas = {
  // --- 认证 ---
  auth: {
    login: Joi.object({
      username: Joi.string().trim().required().messages({
        'string.empty': '用户名不能为空',
        'any.required': '用户名不能为空',
      }),
      password: Joi.string().required().messages({
        'string.empty': '密码不能为空',
        'any.required': '密码不能为空',
      }),
    }),

    changePassword: Joi.object({
      oldPassword: Joi.string().required().messages({
        'string.empty': '旧密码不能为空',
        'any.required': '旧密码不能为空',
      }),
      newPassword: Joi.string().min(6).required().messages({
        'string.empty': '新密码不能为空',
        'any.required': '新密码不能为空',
        'string.min': '新密码长度不能少于6位',
      }),
    }),
  },

  // --- 用户管理 ---
  users: {
    create: Joi.object({
      username: Joi.string().trim().max(50).required().messages({
        'string.empty': '用户名不能为空',
        'any.required': '用户名不能为空',
        'string.max': '用户名长度不能超过50位',
      }),
      password: Joi.string().min(6).max(100).required().messages({
        'string.empty': '密码不能为空',
        'any.required': '密码不能为空',
        'string.min': '密码长度不能少于6位',
      }),
      roles: validRoles.default(['operator']).messages({
        'any.only': '无效角色，可选: admin, manager, operator',
      }),
    }),

    update: Joi.object({
      roles: validRoles.messages({
        'any.only': '无效角色，可选: admin, manager, operator',
      }),
      is_active: Joi.boolean(),
      password: Joi.string().min(6).max(100).messages({
        'string.min': '密码长度不能少于6位',
      }),
    }).min(1).messages({
      'object.min': '没有需要更新的字段',
    }),
  },

  // --- 备件类型 ---
  partTypes: {
    list: Joi.object({
      keyword: Joi.string().allow('').max(100),
      page,
      pageSize,
    }),

    create: Joi.object({
      part_no: Joi.string().trim().max(50).required().messages({
        'string.empty': '备件编号不能为空',
        'any.required': '备件编号不能为空',
      }),
      part_name: Joi.string().trim().max(100).required().messages({
        'string.empty': '备件名称不能为空',
        'any.required': '备件名称不能为空',
      }),
      value_type: validValueType.default('高价值').messages({
        'any.only': '价值类型必须为: 高价值, 低价值',
      }),
      min_stock: Joi.number().integer().min(0).default(0).messages({
        'number.min': '安全库存不能为负数',
      }),
    }),

    update: Joi.object({
      part_name: Joi.string().trim().max(100),
      value_type: validValueType.messages({
        'any.only': '价值类型必须为: 高价值, 低价值',
      }),
      min_stock: Joi.number().integer().min(0).messages({
        'number.min': '安全库存不能为负数',
      }),
    }).min(1).messages({
      'object.min': '没有需要更新的字段',
    }),
  },

  // --- 库存 ---
  inventory: {
    list: Joi.object({
      part_no: Joi.string().allow('').max(50),
      subsidiary: Joi.string().allow('').max(100),
      status: Joi.number().integer().valid(0, 1).messages({
        'any.only': 'status 只能为 0(在库) 或 1(已出库)',
      }),
      keyword: Joi.string().allow('').max(100),
      page,
      pageSize,
    }),

    inbound: Joi.object({
      part_no: Joi.string().trim().required().messages({
        'string.empty': '备件编号不能为空',
        'any.required': '备件编号不能为空',
      }),
      serial_number: Joi.string().trim().allow('').optional().messages({
        'string.empty': '序列号不能为空',
      }),
      subsidiary: Joi.string().trim().required().messages({
        'string.empty': '子公司不能为空',
        'any.required': '子公司不能为空',
      }),
      warehouse: Joi.string().trim().required().messages({
        'string.empty': '仓库不能为空',
        'any.required': '仓库不能为空',
      }),
      condition: validCondition.default('全新').messages({
        'any.only': '成色必须为: 全新, 利旧/返还',
      }),
    }),

    edit: Joi.object({
      subsidiary: Joi.string().trim().max(100),
      warehouse: Joi.string().trim().max(100),
      condition: validCondition.messages({
        'any.only': '成色必须为: 全新, 利旧/返还',
      }),
      part_no: Joi.string().trim().max(50),
    }).min(1).messages({
      'object.min': '没有需要更新的字段',
    }),

    batchImport: Joi.object({
      items: Joi.array().items(
        Joi.object({
          part_no: Joi.string().trim().required(),
          serial_number: Joi.string().trim().allow('').optional(),
          subsidiary: Joi.string().trim().required(),
          warehouse: Joi.string().trim().required(),
          condition: validCondition.default('全新'),
        })
      ).min(1).max(500).required().messages({
        'array.min': '导入数据不能为空',
        'array.max': '单次导入不能超过500条',
        'any.required': '导入数据不能为空',
      }),
    }),
  },

  // --- 申请审批 ---
  requests: {
    create: Joi.object({
      items: Joi.array().items(
        Joi.object({
          part_no: Joi.string().trim().required().messages({
            'string.empty': '备件编号不能为空',
            'any.required': '备件编号不能为空',
          }),
          quantity: Joi.number().integer().min(1).required().messages({
            'number.min': '数量必须大于0',
            'any.required': '数量不能为空',
          }),
        })
      ).min(1).required().messages({
        'array.min': '申请明细不能为空',
        'any.required': '申请明细不能为空',
      }),
      project_location: Joi.string().trim().max(200).required().messages({
        'string.empty': '项目地点不能为空',
        'any.required': '项目地点不能为空',
      }),
      outbound_reason: Joi.string().valid('维修', '调用', '销售').required().messages({
        'any.only': '出库原因必须为: 维修, 调用, 销售',
        'string.empty': '出库原因不能为空',
        'any.required': '出库原因不能为空',
      }),
      remark: Joi.string().allow('').max(500).default(''),
    }),

    list: Joi.object({
      status: Joi.string().valid('pending', 'approved', 'rejected', 'cancelled').messages({
        'any.only': 'status 只能为 pending/approved/rejected/cancelled',
      }),
      applicant: Joi.string().allow('').max(50),
      page,
      pageSize,
    }),

    approve: Joi.object({
      partial_items: Joi.array().items(
        Joi.object({
          part_no: Joi.string().trim().required(),
          serial_numbers: Joi.array().items(Joi.string().trim()).min(1),
          quantity: Joi.number().integer().min(1),
        }).or('serial_numbers', 'quantity')
      ).min(1),
    }),

    reject: Joi.object({
      reason: Joi.string().trim().max(500).required().messages({
        'string.empty': '驳回原因不能为空',
        'any.required': '驳回原因不能为空',
      }),
    }),
  },

  // --- 数据分析 (query 参数) ---
  analytics: {
    consumption: Joi.object({
      months: Joi.number().integer().min(1).max(120).default(6).messages({
        'number.min': 'months 至少为1',
        'number.max': 'months 最大为120',
      }),
    }),

    age: Joi.object({
      stale_days: Joi.number().integer().min(1).max(3650).default(90).messages({
        'number.min': 'stale_days 至少为1',
        'number.max': 'stale_days 最大为3650',
      }),
    }),

    turnover: Joi.object({
      months: Joi.number().integer().min(1).max(120).default(6).messages({
        'number.min': 'months 至少为1',
        'number.max': 'months 最大为120',
      }),
    }),
  },

  // --- 系统日志 (query 参数) ---
  logs: {
    list: Joi.object({
      category: Joi.string().allow('').max(200),
      operator: Joi.string().allow('').max(200),
      start_date: Joi.date().iso().messages({
        'date.format': 'start_date 格式无效，需要 ISO 日期格式',
      }),
      end_date: Joi.date().iso().messages({
        'date.format': 'end_date 格式无效，需要 ISO 日期格式',
      }),
      page: page,
      page_size: pageSize,
    }),
  },

  // --- 通用参数校验 ---
  params: {
    objectId: Joi.object({
      id: Joi.string().pattern(objectIdPattern).required().messages({
        'string.pattern.base': '无效的ID格式',
        'any.required': 'ID不能为空',
      }),
    }),
  },
};

// ========== 校验中间件工厂 ==========

/**
 * 生成 Express 校验中间件
 * @param {Joi.Schema} schema - Joi schema
 * @param {'body'|'query'|'params'} source - 校验目标，默认 'body'
 * @returns {Function} Express middleware
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const { error, value } = schema.validate(data, {
      abortEarly: false,       // 返回所有错误
      stripUnknown: true,      // 移除未定义的字段
      convert: true,           // 自动类型转换 (string → number for query)
    });

    if (error) {
      const messages = error.details.map(d => d.message);
      return res.status(400).json({
        code: 1,
        message: messages.join('; '),
        errors: messages,
      });
    }

    // 用校验/转换后的值覆盖原始数据
    req[source] = value;
    next();
  };
}

module.exports = { schemas, validate };
