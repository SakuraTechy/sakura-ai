/**
 * 清理乱码/无效的知识库集合
 */

import fetch from 'node-fetch';

const QDRANT_URL = 'http://localhost:6333';

// 保留的有效集合
const VALID_COLLECTIONS = [
  'test_knowledge_实物2.0',
  'test_knowledge_渠道集采',
  'test_knowledge_拍卖',
  'smartlearn' // 其他项目的集合，保留
];

async function main() {
  try {
    console.log('🧹 开始清理无效集合...\n');

    // 获取所有集合
    const response = await fetch(`${QDRANT_URL}/collections`);
    const data = await response.json();
    const allCollections = data.result.collections.map(c => c.name);

    console.log('📋 当前所有集合:');
    allCollections.forEach(name => console.log(`   - ${name}`));
    console.log('');

    // 找出需要删除的集合
    const collectionsToDelete = allCollections.filter(name => !VALID_COLLECTIONS.includes(name));

    if (collectionsToDelete.length === 0) {
      console.log('✅ 所有集合都有效，无需清理');
      return;
    }

    console.log(`🗑️  发现 ${collectionsToDelete.length} 个无效集合需要删除:\n`);

    for (const collectionName of collectionsToDelete) {
      console.log(`   删除: ${collectionName}`);
      const encodedName = encodeURIComponent(collectionName);

      try {
        const deleteResponse = await fetch(`${QDRANT_URL}/collections/${encodedName}`, {
          method: 'DELETE'
        });
        const deleteData = await deleteResponse.json();

        if (deleteData.status === 'ok') {
          console.log(`   ✅ 删除成功`);
        } else {
          console.log(`   ❌ 删除失败:`, deleteData);
        }
      } catch (error) {
        console.error(`   ❌ 删除失败:`, error.message);
      }
      console.log('');
    }

    // 显示清理后的集合
    console.log('📊 清理后的集合:');
    const finalResponse = await fetch(`${QDRANT_URL}/collections`);
    const finalData = await finalResponse.json();

    for (const collection of finalData.result.collections) {
      const infoResponse = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(collection.name)}`);
      const info = await infoResponse.json();
      console.log(`   ✅ ${collection.name}`);
      console.log(`      知识点数: ${info.result.points_count}`);
      console.log(`      向量维度: ${info.result.config.params.vectors.size}`);
    }

    console.log('\n✅ 清理完成');

  } catch (error) {
    console.error('❌ 清理失败:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
