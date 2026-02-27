const express = require('express');
const path = require('path');
const app = express();

const rootPath = process.cwd();

// 1. 루트에 index.html 서빙
app.use(express.static(rootPath));

// 2. static 전체 서빙 (하위 폴더 모두 포함!)
app.use('/static', express.static(path.join(rootPath, 'static')));

// 3. 루트(/)는 로그인페이지
app.get('/', (req, res) => {
    res.sendFile(path.join(rootPath, 'static', '91.login', 'loginpage.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
