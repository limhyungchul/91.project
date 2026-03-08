// app.js - 보안 강화 + 기존 기능 100% 보존
require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');           // ✅ 3️⃣ HTTPS 보안 헤더
const rateLimit = require('express-rate-limit'); // ✅ 2️⃣ 전체 API 제한

const apiRoutes = require('./api-routes');
const app = express();
const rootPath = __dirname;

/* ===================================================
   ✅ 1️⃣ 보안 미들웨어 (가장 먼저 적용!)
=================================================== */
app.use(helmet({
    hsts: {
        maxAge: 31536000,        // 1년 HTTPS 강제
        includeSubDomains: true,
        preload: true
    }
}));

/* ===================================================
   ✅ 2️⃣ API 전체 요청 제한 (100회/15분)
=================================================== */
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15분
    max: 100,                   // IP당 100회
    message: { success: false, message: '요청 제한 초과 (15분 후 재시도)' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ===================================================
   3️⃣ MongoDB 연결 (기존 그대로)
=================================================== */
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("✅ MongoDB 연결 성공");
}).catch(err => {
    console.error("❌ MongoDB 연결 실패:", err);
    process.exit(1);
});

/* ===================================================
   4️⃣ 요청 로그 (디버그용, 기존 그대로)
=================================================== */
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

/* ===================================================
   5️⃣ 루트 페이지 (기존 그대로)
=================================================== */
app.get('/', (req, res) => {
    console.log("루트 접속");
    res.redirect('/static/91.login/loginpage.html');
});

/* ===================================================
   6️⃣ 정적 파일 서빙 (기존 그대로)
=================================================== */
app.use('/static', express.static(path.join(rootPath, 'static')));
app.use(express.static(rootPath));

/* ===================================================
   ✅ 7️⃣ API 라우터 (전체 제한 + 보안 적용)
=================================================== */
app.use('/api', apiLimiter, apiRoutes);  // 🔒 apiLimiter 추가!

/* ===================================================
   8️⃣ 404 처리 (기존 그대로)
=================================================== */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API not found"
    });
});

/* ===================================================
   9️⃣ 서버 에러 처리 (기존 그대로)
=================================================== */
app.use((err, req, res, next) => {
    console.error("서버 에러:", err);
    res.status(500).json({
        success: false,
        message: "서버 내부 오류"
    });
});

/* ===================================================
   🔟 서버 실행 (기존 그대로)
=================================================== */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("\n🚀 서버 실행 완료");
    console.log(`🌐 http://localhost:${PORT}`);
    console.log("🔒 보안: Helmet(HSTS) + RateLimit(API) 적용됨");
});
