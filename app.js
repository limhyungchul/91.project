//app.js는 셋업,라우터 연결용 api-routes.js는 api전담,잡기능포함나머지

// app.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const apiRoutes = require('./api-routes');

const app = express();
const rootPath = __dirname;

// ==============================
// ✅ MongoDB 연결 (기존 그대로)
// ==============================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB 연결 성공'))
    .catch(err => {
        console.error('❌ MongoDB 연결 실패:', err.message);
        process.exit(1);
    });

// ==============================
// ✅ 1. 미들웨어
// ==============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==============================
// ✅ 2. 루트 라우트
// ==============================
app.get('/', (req, res) => {
    console.log('✅ 루트(/) 라우트 실행됨!');
    res.redirect('/static/91.login/loginpage.html');
});

// ==============================
// ✅ 3. 정적 파일
// ==============================
app.use('/static', express.static(path.join(rootPath, 'static')));
app.use(express.static(rootPath));

// ==============================
// ✅ 4. API 라우트 연결 (/api/* 전부 api-routes.js로 위임)
// ==============================
app.use('/api', apiRoutes);

// ==============================
// ✅ 서버 실행
// ==============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`\n🚀 서버 실행 완료: http://localhost:${PORT}`);
});
