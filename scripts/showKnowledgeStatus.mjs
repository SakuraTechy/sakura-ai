/**
 * 显示知识库状态脚本
 */

import fetch from 'node-fetch';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

// 系统映射 - 从集合名反推系统名
function getSystemName(collectionName) {
  // 移除前缀 'test_knowledge_'
  const name = collectionName.replace('test_knowledge_', '');

  // 映射表
  const nameMap = {
    '实物1_0': '实物1.0',
    '实物2_0': '实物2.0',
    'saas': 'SAAS',
    '供应链开放平台': '供应链开放平台',
    '权益管理平台': '权益管理平台',
    '综合运营平台': '综合运营平台',
    '立减金管理平台': '立减金管理平台',
    '营销管理中台': '营销管理中台'
  };

  return nameMap[name] || name;
}

async function main() {
  try {
    console.log('📊 Sakura AI 知识库状态总览\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 获取所有集合
    const response = await fetch(`${QDRANT_URL}/collections`);
    const data = await response.json();
    const allCollections = data.result.collections.map(c => c.name);

    // 只显示测试知识库集合
    const testKnowledgeCollections = allCollections.filter(name => name.startsWith('test_knowledge_'));

    console.log(`🗄️  Qdrant 向量数据库地址: ${QDRANT_URL}`);
    console.log(`📚 知识库集合总数: ${testKnowledgeCollections.length}\n`);

    // 显示每个系统的知识库状态
    for (const collectionName of testKnowledgeCollections) {
      const encodedName = encodeURIComponent(collectionName);
      const infoResponse = await fetch(`${QDRANT_URL}/collections/${encodedName}`);
      const info = await infoResponse.json();

      const systemName = getSystemName(collectionName);

      console.log(`┌─ 系统: ${systemName}`);
      console.log(`├─ 集合名称: ${collectionName}`);
      console.log(`├─ 知识点数量: ${info.result.points_count} 条`);
      console.log(`├─ 向量维度: ${info.result.config.params.vectors.size}D`);
      console.log(`├─ 距离计算: ${info.result.config.params.vectors.distance}`);
      console.log(`└─ 状态: ${info.result.status}\n`);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 统计总知识点数
    let totalKnowledge = 0;
    for (const collectionName of testKnowledgeCollections) {
      const encodedName = encodeURIComponent(collectionName);
      const infoResponse = await fetch(`${QDRANT_URL}/collections/${encodedName}`);
      const info = await infoResponse.json();
      totalKnowledge += info.result.points_count;
    }

    console.log(`📊 统计汇总:`);
    console.log(`   - 系统总数: ${testKnowledgeCollections.length}`);
    console.log(`   - 知识点总数: ${totalKnowledge} 条`);
    console.log('');

    // 显示如何使用
    console.log('💡 使用说明:\n');
    console.log('1. 在创建/编辑测试用例时，选择对应的系统');
    console.log('2. AI 会自动使用该系统专属的知识库进行 RAG 增强');
    console.log('3. 通过后端 API 可以为每个系统添加业务知识:');
    console.log('   POST /api/v1/knowledge/:systemName/add');
    console.log('   POST /api/v1/knowledge/:systemName/batch-import\n');

    console.log('📚 知识类别:');
    console.log('   - business_rule: 业务规则');
    console.log('   - test_pattern: 测试模式');
    console.log('   - pitfall: 历史踩坑点');
    console.log('   - risk_scenario: 资损风险场景\n');

    console.log('✅ 多系统知识库架构已就绪');

  } catch (error) {
    console.error('❌ 获取状态失败:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
