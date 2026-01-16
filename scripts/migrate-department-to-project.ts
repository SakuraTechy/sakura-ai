import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

/**
 * 数据迁移脚本：将 department 字段的数据迁移到 project 字段
 * 这个脚本用于在数据库字段重命名后，确保数据正确迁移
 */
async function migrateDepartmentToProject() {
  try {
    console.log('🔄 开始迁移 department 到 project...\n');

    // 1. 迁移 users 表
    console.log('📋 迁移 users 表...');
    const usersResult = await prisma.$executeRawUnsafe(`
      UPDATE users 
      SET project = department 
      WHERE project IS NULL AND department IS NOT NULL
    `);
    console.log(`✅ users 表：已迁移 ${usersResult} 条记录\n`);

    // 2. 迁移 test_suites 表
    console.log('📋 迁移 test_suites 表...');
    const suitesResult = await prisma.$executeRawUnsafe(`
      UPDATE test_suites 
      SET project = department 
      WHERE project IS NULL AND department IS NOT NULL
    `);
    console.log(`✅ test_suites 表：已迁移 ${suitesResult} 条记录\n`);

    // 3. 迁移 test_cases 表
    console.log('📋 迁移 test_cases 表...');
    const casesResult = await prisma.$executeRawUnsafe(`
      UPDATE test_cases 
      SET project = department 
      WHERE project IS NULL AND department IS NOT NULL
    `);
    console.log(`✅ test_cases 表：已迁移 ${casesResult} 条记录\n`);

    // 4. 迁移 test_case_executions 表
    console.log('📋 迁移 test_case_executions 表...');
    const executionsResult = await prisma.$executeRawUnsafe(`
      UPDATE test_case_executions 
      SET executor_project = executor_department 
      WHERE executor_project IS NULL AND executor_department IS NOT NULL
    `);
    console.log(`✅ test_case_executions 表：已迁移 ${executionsResult} 条记录\n`);

    // 5. 迁移 functional_test_executions 表
    console.log('📋 迁移 functional_test_executions 表...');
    const functionalResult = await prisma.$executeRawUnsafe(`
      UPDATE functional_test_executions 
      SET executor_project = executor_department 
      WHERE executor_project IS NULL AND executor_department IS NOT NULL
    `);
    console.log(`✅ functional_test_executions 表：已迁移 ${functionalResult} 条记录\n`);

    // 6. 验证迁移结果
    console.log('📊 验证迁移结果...\n');
    
    const usersWithProject = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(*) as count FROM users WHERE project IS NOT NULL
    `);
    console.log(`✅ users 表中有项目的记录数: ${usersWithProject[0].count}`);

    const suitesWithProject = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(*) as count FROM test_suites WHERE project IS NOT NULL
    `);
    console.log(`✅ test_suites 表中有项目的记录数: ${suitesWithProject[0].count}`);

    console.log('\n✅ 数据迁移完成');

  } catch (error: any) {
    console.error('❌ 迁移失败:', error);
    
    // 如果是字段不存在的错误，说明迁移可能已经完成或字段名已更改
    if (error.message?.includes('Unknown column') || error.message?.includes('department')) {
      console.log('\n⚠️ 提示：如果字段已经重命名为 project，这个脚本可能不需要运行。');
      console.log('   请确保已经执行了 Prisma 迁移：npx prisma migrate deploy');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行迁移
migrateDepartmentToProject();

