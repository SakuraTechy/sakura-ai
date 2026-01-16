/**
 * 清空功能测试用例数据脚本
 * 使用方法: node scripts/clearFunctionalTestData.js
 */

import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function clearFunctionalTestData() {
  console.log('🚀 开始清空功能测试用例数据...\n');

  try {
    // 1. 清空功能测试点（必须先清空，因为有外键关联）
    console.log('📝 步骤 1/3: 清空功能测试点...');
    const deleteTestPoints = await prisma.functional_test_points.deleteMany({});
    console.log(`   ✅ 已删除 ${deleteTestPoints.count} 条测试点记录\n`);

    // 2. 清空功能测试用例
    console.log('📝 步骤 2/3: 清空功能测试用例...');
    const deleteTestCases = await prisma.functional_test_cases.deleteMany({});
    console.log(`   ✅ 已删除 ${deleteTestCases.count} 条测试用例记录\n`);

    // 3. 清空AI生成会话
    console.log('📝 步骤 3/3: 清空AI生成会话...');
    const deleteSessions = await prisma.ai_generation_sessions.deleteMany({});
    console.log(`   ✅ 已删除 ${deleteSessions.count} 条生成会话记录\n`);

    // 验证清空结果
    console.log('🔍 验证清空结果:');
    const remainingTestPoints = await prisma.functional_test_points.count();
    const remainingTestCases = await prisma.functional_test_cases.count();
    const remainingSessions = await prisma.ai_generation_sessions.count();

    console.log(`   - functional_test_points: ${remainingTestPoints} 条记录`);
    console.log(`   - functional_test_cases: ${remainingTestCases} 条记录`);
    console.log(`   - ai_generation_sessions: ${remainingSessions} 条记录\n`);

    if (remainingTestPoints === 0 && remainingTestCases === 0 && remainingSessions === 0) {
      console.log('✅ 功能测试用例数据已成功清空');
    } else {
      console.log('⚠️  警告：部分数据未清空，请检查');
    }

  } catch (error) {
    console.error('❌ 清空数据失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 执行清空操作
clearFunctionalTestData()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
