#!/usr/bin/env node
/**
 * MongoDB JSON → 微信云数据库 JSONL 转换工具
 *
 * 用法:
 *   node scripts/mongo2wx.js <input.json> [output.jsonl]
 *
 * 说明:
 *   - 输入: MongoDB 导出的 JSON 文件（数组格式或 mongoexport 的逐行格式）
 *   - 输出: 微信云数据库可导入的 JSONL 格式（每行一条记录）
 *   - 自动处理 MongoDB 扩展 JSON 类型（$oid, $date, $numberInt 等）
 */
const fs = require('fs');
const path = require('path');

const inputArg = process.argv[2];
if (!inputArg) {
  console.error('用法: node mongo2wx.js <input.json> [output.jsonl]');
  process.exit(1);
}

const inputFile = path.resolve(inputArg);
if (!fs.existsSync(inputFile)) {
  console.error(`错误: 找不到文件 "${inputArg}"`);
  console.error(`完整路径: ${inputFile}`);
  process.exit(1);
}

const outputArg = process.argv[3] || inputArg.replace(/\.json$/i, '.jsonl');
const outputFile = path.resolve(outputArg);

/**
 * 递归转换 MongoDB 扩展 JSON 类型为普通值
 */
function convertValue(val) {
  if (val === null || val === undefined) return val;

  if (Array.isArray(val)) {
    return val.map(convertValue);
  }

  if (typeof val === 'object') {
    const keys = Object.keys(val);

    // MongoDB 扩展类型 — 单 key 对象
    if (keys.length === 1) {
      const key = keys[0];
      switch (key) {
        case '$oid':
          return val.$oid;
        case '$date':
          // { $date: "..." } 或 { $date: { $numberLong: "..." } }
          if (typeof val.$date === 'string') return val.$date;
          if (val.$date && val.$date.$numberLong) {
            return new Date(parseInt(val.$date.$numberLong)).toISOString();
          }
          return val.$date;
        case '$numberInt':
          return parseInt(val.$numberInt);
        case '$numberLong':
          return parseInt(val.$numberLong);
        case '$numberDouble':
          return parseFloat(val.$numberDouble);
        case '$numberDecimal':
          return parseFloat(val.$numberDecimal);
        case '$binary':
          return val.$binary;
        case '$regex':
          return val.$regex;
      }
    }

    // _id 字段: MongoDB 的 ObjectId 转为字符串
    const result = {};
    for (const [k, v] of Object.entries(val)) {
      result[k] = convertValue(v);
    }
    return result;
  }

  return val;
}

// 读取输入
const raw = fs.readFileSync(inputFile, 'utf-8').trim();
let records;

try {
  // 尝试标准 JSON 数组
  const parsed = JSON.parse(raw);
  records = Array.isArray(parsed) ? parsed : [parsed];
} catch {
  // 尝试逐行 JSON（mongoexport --jsonArray=false）
  records = raw
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

// 转换并输出
const lines = records.map(doc => {
  const converted = convertValue(doc);
  return JSON.stringify(converted);
});

fs.writeFileSync(outputFile, lines.join('\n') + '\n', 'utf-8');
console.log(`转换完成: ${records.length} 条记录`);
console.log(`输出文件: ${outputFile}`);
