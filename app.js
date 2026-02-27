const express = require('express');
const path = require('path');
const app = express();

const rootPath = process.cwd();

// 정적 파일 서빙
app.use(express.static(path.join(rootPath, 'static')));

// 첫 페이지 - 실제 영어 파일명으로 수정
app.get('/', (req, res) => {
    res.sendFile(path.join(rootPath, 'static', '91.login', 'Loginpage.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
