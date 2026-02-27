const express = require('express');
const path = require('path');
const app = express();

// 절대경로 기준 (Render 안전 방식)
const rootPath = process.cwd();

// 정적 파일 서빙
app.use(express.static(path.join(rootPath, 'static')));

// 첫 페이지 (로그인 페이지)
app.get('/', (req, res) => {
    res.sendFile(path.join(rootPath, 'static', '91_login', 'LoginPage.html'));
});

// 포트 설정 (Render 기본 10000 대응)
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// 수정되었나?