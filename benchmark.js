const { performance } = require('perf_hooks');

const items = [];
for (let i = 0; i < 10000; i++) {
    items.push({
        text: `Item ${i % 500}`,
        haveCount: 1,
        wantCount: 50,
        shopCompleted: true,
        shopCheckOrder: 123
    });
}

function runOriginal() {
    const currentList = { items: JSON.parse(JSON.stringify(items)) };
    const start = performance.now();
    currentList.items.forEach(item => {
        const sameNameItems = currentList.items.filter(i => i.text.trim() === item.text.trim());
        const totalHave = sameNameItems.reduce((sum, i) => sum + i.haveCount, 0);
        const toBuy = Math.max(0, item.wantCount - totalHave);
        if (toBuy > 0) {
            item.shopCompleted = false;
            item.shopCheckOrder = null;
        }
    });
    return performance.now() - start;
}

function runOptimized() {
    const currentList = { items: JSON.parse(JSON.stringify(items)) };
    const start = performance.now();

    const totalHaveMap = new Map();
    for (const item of currentList.items) {
        const name = item.text.trim();
        totalHaveMap.set(name, (totalHaveMap.get(name) || 0) + item.haveCount);
    }

    currentList.items.forEach(item => {
        const totalHave = totalHaveMap.get(item.text.trim());
        const toBuy = Math.max(0, item.wantCount - totalHave);
        if (toBuy > 0) {
            item.shopCompleted = false;
            item.shopCheckOrder = null;
        }
    });

    return performance.now() - start;
}

console.log(`Original: ${runOriginal().toFixed(2)}ms`);
console.log(`Optimized: ${runOptimized().toFixed(2)}ms`);
