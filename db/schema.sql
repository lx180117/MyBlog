-- =============================================================================
--  博客平台 · 数据库建表脚本
--  DBMS   : PostgreSQL 18
--  依据   : docs/01-需求规格说明.md (v2)
--  选型   : docs/02-技术选型.md   (Prisma + PostgreSQL)
--  日期   : 2026-09-17
--  用法   : psql -U postgres -d blog -f db/schema.sql
--
--  说明   : 脚本可重复执行（类型用 DO 块兜底、表/索引/触发器均带 IF NOT EXISTS
--           或先 DROP 再建）。生产环境请先备份。
--           管理员账号不在此脚本创建 —— 密码需 argon2 哈希，由 Step 5 的 seed
--           脚本生成，避免算法不一致导致登录失败。
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. 扩展
-- -----------------------------------------------------------------------------
-- pg_trgm：中文子串模糊搜索的关键。它按「字符三元组」切分，对中文有效，
--          可让 ILIKE '%关键词%' 走上 GIN 索引（tsvector 做不到这一点）。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 以下两个 v1.1 再考虑，v1 不启用（需自行编译安装，增加运维负担）：
-- CREATE EXTENSION IF NOT EXISTS pg_jieba;   -- 中文分词，装好后可把下面的 'simple' 换成 'jiebacfg'
-- CREATE EXTENSION IF NOT EXISTS zhparser;   -- 另一种中文分词方案


-- -----------------------------------------------------------------------------
-- 1. 枚举类型
-- -----------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE user_role      AS ENUM ('admin', 'author');                    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE user_status    AS ENUM ('pending', 'active', 'disabled');        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE article_status AS ENUM ('draft', 'published', 'deleted');        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE comment_status AS ENUM ('pending', 'approved', 'rejected');      EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- -----------------------------------------------------------------------------
-- 2. users —— 账号（作者 + 管理员统一存这里，靠 role 区分）
-- -----------------------------------------------------------------------------
-- 命名为 users 而非 user：user 是 SQL 标准保留字（等价于 current_user），
-- 用 user 做表名每次查询都得加双引号，是常见的坑。
CREATE TABLE IF NOT EXISTS users (
    id               BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username         VARCHAR(50)  NOT NULL,           -- 登录名，全小写 slug，URL 里做作者主页用
    email            VARCHAR(255) NOT NULL,
    password_hash    VARCHAR(255) NOT NULL,           -- argon2id 哈希，绝不存明文
    nickname         VARCHAR(50)  NOT NULL,           -- 展示名，允许中文
    avatar_url       VARCHAR(500),
    bio              VARCHAR(500),                    -- 个人简介，作者主页展示
    website          VARCHAR(255),
    github           VARCHAR(255),

    role             user_role    NOT NULL DEFAULT 'author',
    status           user_status  NOT NULL DEFAULT 'pending',  -- 开放注册后默认待审核

    last_login_at    TIMESTAMPTZ,
    login_fail_count SMALLINT     NOT NULL DEFAULT 0,  -- 配合 locked_until 做登录限流
    locked_until     TIMESTAMPTZ,

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- 登录名强制小写 slug：避免 Alice / alice 并存导致的大小写歧义
    CONSTRAINT ck_users_username_format
        CHECK (username ~ '^[a-z0-9][a-z0-9_-]{2,49}$'),
    CONSTRAINT uk_users_username UNIQUE (username),
    CONSTRAINT ck_users_nickname_not_blank
        CHECK (btrim(nickname) <> '')
);

-- 邮箱按业务惯例大小写不敏感：唯一性用函数索引，而不是列级 UNIQUE
CREATE UNIQUE INDEX IF NOT EXISTS uk_users_email_lower ON users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_status       ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_role         ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_created_at   ON users (created_at DESC);

COMMENT ON TABLE  users            IS '账号表：作者与管理员统一存储，role 区分角色，status 三态控制准入';
COMMENT ON COLUMN users.username   IS '登录名，全小写 slug，同时作为作者主页 /author/{username} 的路径参数';
COMMENT ON COLUMN users.password_hash IS 'argon2id 哈希值；管理员后台重置密码时由后端重新哈希后写入';


-- -----------------------------------------------------------------------------
-- 3. categories —— 分类（单层，由管理员统一维护）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id          BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL,
    slug        VARCHAR(50)  NOT NULL,
    description VARCHAR(200),
    sort_order  INTEGER      NOT NULL DEFAULT 0,      -- 前台分类栏的展示顺序
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uk_categories_name UNIQUE (name),
    CONSTRAINT uk_categories_slug UNIQUE (slug),
    CONSTRAINT ck_categories_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,49}$')
);

CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories (sort_order, id);

COMMENT ON TABLE categories IS '分类表：单层级，仅管理员可增删改；作者发文时只能选用已有分类';


-- -----------------------------------------------------------------------------
-- 4. tags —— 标签（多对多，作者可自由创建）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
    id         BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       VARCHAR(50)  NOT NULL,
    slug       VARCHAR(50)  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uk_tags_name UNIQUE (name),
    CONSTRAINT uk_tags_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags (slug);

COMMENT ON TABLE tags IS '标签表：作者可自由创建；后台提供合并与清理能力';


-- -----------------------------------------------------------------------------
-- 5. articles —— 文章（核心表）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS articles (
    id            BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    author_id     BIGINT          NOT NULL,
    category_id   BIGINT,

    title         VARCHAR(200)    NOT NULL,
    slug          VARCHAR(200)    NOT NULL,           -- 文章 URL 标识，全局唯一
    summary       VARCHAR(500),                       -- 摘要；为空时由后端从正文截取
    content       TEXT            NOT NULL,           -- Markdown 原文（唯一真实来源）
    content_html  TEXT,                               -- 渲染后的 HTML 缓存，避免每次请求重复渲染
    cover_url     VARCHAR(500),

    status        article_status  NOT NULL DEFAULT 'draft',
    is_top        BOOLEAN         NOT NULL DEFAULT false,

    -- 冗余计数字段：避免列表页每次都 count(*)。由触发器/应用层维护，别手改
    view_count    INTEGER         NOT NULL DEFAULT 0,
    like_count    INTEGER         NOT NULL DEFAULT 0,
    comment_count INTEGER         NOT NULL DEFAULT 0,

    published_at  TIMESTAMPTZ,                        -- 定时发布：写入未来时间，到点由任务翻转状态
    created_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ,                        -- 回收站：软删除，可恢复

    -- 中文/英文全文检索向量，由触发器维护
    search_vector tsvector,

    CONSTRAINT fk_articles_author
        FOREIGN KEY (author_id)   REFERENCES users(id)      ON DELETE RESTRICT,
    CONSTRAINT fk_articles_category
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,

    CONSTRAINT uk_articles_slug UNIQUE (slug),
    -- 已发布的文章必须有发布时间，否则前台排序会踩空
    CONSTRAINT ck_articles_published_at
        CHECK (status <> 'published' OR published_at IS NOT NULL),
    -- 软删状态必须留删除时间戳，便于回收站按时间清理
    CONSTRAINT ck_articles_deleted_at
        CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_articles_author    ON articles (author_id);
CREATE INDEX IF NOT EXISTS idx_articles_category  ON articles (category_id);
-- 部分索引：前台 90% 的查询都是「已发布且已到时间」，只索引这部分数据，索引更小更快
CREATE INDEX IF NOT EXISTS idx_articles_feed
    ON articles (published_at DESC)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_articles_top
    ON articles (is_top DESC, published_at DESC)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_articles_draft
    ON articles (author_id, updated_at DESC)
    WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_articles_deleted
    ON articles (deleted_at DESC)
    WHERE status = 'deleted';
-- 英文/分词后的全文检索（中文见下方 pg_trgm 索引）
CREATE INDEX IF NOT EXISTS idx_articles_search_vector
    ON articles USING GIN (search_vector);
-- 中文子串搜索：让 title ILIKE '%关键词%' 走索引
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm
    ON articles USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_articles_summary_trgm
    ON articles USING GIN (summary gin_trgm_ops);

COMMENT ON TABLE  articles              IS '文章表：Markdown 原文为唯一真实来源，content_html 为渲染缓存可随时重建';
COMMENT ON COLUMN articles.content      IS 'Markdown 原文；导出/迁移时以此列为准';
COMMENT ON COLUMN articles.content_html IS '渲染后的 HTML 缓存，含 XSS 转义；渲染管线升级后可整列重算';
COMMENT ON COLUMN articles.view_count   IS '阅读量冗余计数：由应用层 +1（高频，不挂触发器）';
COMMENT ON COLUMN articles.comment_count IS '已通过审核的评论数，由 trg_comments_sync_count 触发器维护';
COMMENT ON COLUMN articles.search_vector IS '全文检索向量；simple 配置对中文不分词，中文请走 title/summary 的 trgm 索引';


-- -----------------------------------------------------------------------------
-- 6. article_tags —— 文章与标签的多对多中间表
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS article_tags (
    article_id BIGINT      NOT NULL,
    tag_id     BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (article_id, tag_id),
    CONSTRAINT fk_article_tags_article
        FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    CONSTRAINT fk_article_tags_tag
        FOREIGN KEY (tag_id)     REFERENCES tags(id)     ON DELETE CASCADE
);

-- 联合主键已覆盖 article_id 前缀查询；标签页反查需要单独的 tag_id 索引
CREATE INDEX IF NOT EXISTS idx_article_tags_tag ON article_tags (tag_id);

COMMENT ON TABLE article_tags IS '文章-标签关联表；文章或标签删除时级联清理';


-- -----------------------------------------------------------------------------
-- 7. comments —— 评论（支持登录用户与游客双身份，两级结构）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
    id         BIGINT         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_id BIGINT         NOT NULL,
    user_id    BIGINT,                                 -- 登录用户；游客为空
    parent_id  BIGINT,                                 -- 父评论；顶级评论为空（两级结构）

    -- 游客填写；登录用户可留空，展示时取 users.nickname
    nickname   VARCHAR(50),
    email      VARCHAR(255),                           -- 不对外公开，仅站内通知用
    website    VARCHAR(255),

    content    TEXT           NOT NULL,
    status     comment_status NOT NULL DEFAULT 'pending',

    ip_address INET,
    user_agent VARCHAR(300),

    created_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ    NOT NULL DEFAULT now(),

    CONSTRAINT fk_comments_article
        FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_user
        FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL,
    CONSTRAINT fk_comments_parent
        FOREIGN KEY (parent_id)  REFERENCES comments(id) ON DELETE CASCADE,

    -- 要么是登录用户，要么必须留昵称；不能出现「无主的匿名评论」
    CONSTRAINT ck_comments_identity
        CHECK (user_id IS NOT NULL OR (nickname IS NOT NULL AND btrim(nickname) <> '')),
    CONSTRAINT ck_comments_content_not_blank
        CHECK (btrim(content) <> ''),
    CONSTRAINT ck_comments_content_length
        CHECK (char_length(content) <= 2000),
    -- 不能回复自己
    CONSTRAINT ck_comments_parent_not_self
        CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_comments_article ON comments (article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user    ON comments (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent  ON comments (parent_id);
-- 后台「待审核」列表是最常用的筛选，用部分索引
CREATE INDEX IF NOT EXISTS idx_comments_pending ON comments (created_at DESC) WHERE status = 'pending';

COMMENT ON TABLE  comments           IS '评论表：两级结构（顶级 + 回复），登录用户与游客共用一张表';
COMMENT ON COLUMN comments.user_id   IS '登录用户 ID；游客为 NULL，此时 nickname 必填';
COMMENT ON COLUMN comments.parent_id IS '父评论 ID：为空表示顶级评论，非空表示对某条顶级评论的回复';


-- -----------------------------------------------------------------------------
-- 8. article_likes —— 点赞去重表
-- -----------------------------------------------------------------------------
-- 需求里「点赞按 IP + 文章去重」需要落库才能真的去重；只靠 articles.like_count
-- 无法判断某个 IP 是否点过。这张表是去重的依据，like_count 只是它的缓存。
CREATE TABLE IF NOT EXISTS article_likes (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_id BIGINT      NOT NULL,
    user_id    BIGINT,                                 -- 登录用户点赞时记录
    ip_address INET        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_article_likes_article
        FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    CONSTRAINT fk_article_likes_user
        FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL,
    CONSTRAINT uk_article_likes_dedupe UNIQUE (article_id, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_article_likes_article ON article_likes (article_id);

COMMENT ON TABLE article_likes IS '点赞去重表：UNIQUE(article_id, ip_address) 保证同一 IP 对同一篇只能点一次';


-- -----------------------------------------------------------------------------
-- 9. site_settings —— 站点配置（键值对）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_settings (
    setting_key VARCHAR(64)  PRIMARY KEY,
    setting_value TEXT,
    description VARCHAR(200),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE site_settings IS '站点配置键值表：用 KV 而非宽表，加配置项不需要改表结构';


-- -----------------------------------------------------------------------------
-- 10. page_views —— 访问/阅读记录
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS page_views (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    article_id BIGINT      NOT NULL,
    user_id    BIGINT,                                 -- 登录用户访问时记录，便于后续做阅读分析
    ip_address INET,
    user_agent VARCHAR(300),
    referer    VARCHAR(500),
    viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_page_views_article
        FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
    CONSTRAINT fk_page_views_user
        FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_page_views_article ON page_views (article_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_time    ON page_views (viewed_at DESC);

COMMENT ON TABLE page_views IS '访问明细表：数据量随时间线性增长，若累计超过千万行，按 viewed_at 做月度分区';


-- -----------------------------------------------------------------------------
-- 11. 触发器函数
-- -----------------------------------------------------------------------------

-- 11.1 自动维护 updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_articles_updated_at ON articles;
CREATE TRIGGER trg_articles_updated_at
    BEFORE UPDATE ON articles FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_comments_updated_at ON comments;
CREATE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- 11.2 维护文章全文检索向量
--     权重设计：标题 A > 摘要 B > 正文 C，检索时可用 setweight 加权排序
--     注意：'simple' 配置不做中文分词（整句当一个 token）。
--           中文搜索请使用 title/summary 上的 trgm 索引 + ILIKE。
--           装上 pg_jieba 后，把 'simple' 替换为 'jiebacfg' 即可获得中文分词。
CREATE OR REPLACE FUNCTION fn_article_search_vector() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
          setweight(to_tsvector('simple', coalesce(NEW.title,   '')), 'A')
       || setweight(to_tsvector('simple', coalesce(NEW.summary, '')), 'B')
       || setweight(to_tsvector('simple', coalesce(NEW.content, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_articles_search_vector ON articles;
CREATE TRIGGER trg_articles_search_vector
    BEFORE INSERT OR UPDATE OF title, summary, content ON articles
    FOR EACH ROW EXECUTE FUNCTION fn_article_search_vector();


-- 11.3 强制两级评论：不允许「回复的回复」
--     仅靠 parent_id 自关联无法阻止无限嵌套，用触发器在写入层拦住。
CREATE OR REPLACE FUNCTION fn_comment_check_depth() RETURNS trigger AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM comments
             WHERE id = NEW.parent_id AND article_id = NEW.article_id
        ) THEN
            RAISE EXCEPTION '父评论不存在或不属于同一篇文章';
        END IF;

        IF EXISTS (
            SELECT 1 FROM comments
             WHERE id = NEW.parent_id AND parent_id IS NOT NULL
        ) THEN
            RAISE EXCEPTION '只支持两级评论：不能在回复下面再回复';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comments_check_depth ON comments;
CREATE TRIGGER trg_comments_check_depth
    BEFORE INSERT OR UPDATE OF parent_id, article_id ON comments
    FOR EACH ROW EXECUTE FUNCTION fn_comment_check_depth();


-- 11.4 同步 articles.comment_count（只统计已通过审核的评论）
CREATE OR REPLACE FUNCTION fn_sync_article_comment_count() RETURNS trigger AS $$
DECLARE
    v_article_id BIGINT := COALESCE(NEW.article_id, OLD.article_id);
BEGIN
    UPDATE articles a
       SET comment_count = (
             SELECT count(*) FROM comments c
              WHERE c.article_id = v_article_id AND c.status = 'approved'
           )
     WHERE a.id = v_article_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comments_sync_count ON comments;
CREATE TRIGGER trg_comments_sync_count
    AFTER INSERT OR UPDATE OR DELETE ON comments
    FOR EACH ROW EXECUTE FUNCTION fn_sync_article_comment_count();


-- 11.5 同步 articles.like_count
CREATE OR REPLACE FUNCTION fn_sync_article_like_count() RETURNS trigger AS $$
DECLARE
    v_article_id BIGINT := COALESCE(NEW.article_id, OLD.article_id);
BEGIN
    UPDATE articles a
       SET like_count = (
             SELECT count(*) FROM article_likes l WHERE l.article_id = v_article_id
           )
     WHERE a.id = v_article_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_likes_sync_count ON article_likes;
CREATE TRIGGER trg_likes_sync_count
    AFTER INSERT OR DELETE ON article_likes
    FOR EACH ROW EXECUTE FUNCTION fn_sync_article_like_count();


-- -----------------------------------------------------------------------------
-- 12. 视图：前台文章列表（列表页直接查它，省掉每次三表 JOIN）
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_published_articles AS
SELECT a.id,
       a.author_id,
       u.username    AS author_username,
       u.nickname    AS author_nickname,
       u.avatar_url  AS author_avatar,
       a.category_id,
       c.name        AS category_name,
       c.slug        AS category_slug,
       a.title,
       a.slug,
       a.summary,
       a.cover_url,
       a.is_top,
       a.view_count,
       a.like_count,
       a.comment_count,
       a.published_at,
       a.updated_at
  FROM articles a
  JOIN users u      ON u.id = a.author_id
  LEFT JOIN categories c ON c.id = a.category_id
 WHERE a.status = 'published'
   AND a.published_at <= now();

COMMENT ON VIEW v_published_articles IS '前台可见文章列表：已发布且发布时间已到，自带作者与分类信息';


-- -----------------------------------------------------------------------------
-- 13. 初始站点配置
-- -----------------------------------------------------------------------------
INSERT INTO site_settings (setting_key, setting_value, description) VALUES
    ('site_name',        '我的博客',        '站点名称，出现在页头与页面标题'),
    ('site_description', '技术、思考与记录', '站点副标题 / SEO description'),
    ('site_logo',        '',                'Logo 图片地址'),
    ('site_favicon',     '',                'favicon 地址'),
    ('icp_number',       '',                'ICP 备案号，留空则不展示'),
    ('per_page',         '12',              '前台列表每页文章数'),
    ('register_enabled', 'true',            '是否开放自助注册'),
    ('register_need_approve', 'true',       '新注册账号是否需要管理员审核激活'),
    ('comment_enabled',  'true',            '是否开启评论'),
    ('comment_need_approve', 'true',        '新评论是否需要审核'),
    ('comment_allow_guest', 'true',         '是否允许未登录访客评论'),
    ('sensitive_words',  '',                '敏感词列表，逗号分隔'),
    ('social_links',     '[]',              '社交链接，JSON 数组 [{name,url,icon}]')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;

-- =============================================================================
--  后续步骤
--  1. 管理员账号：由 Step 5 的后端 seed 脚本创建（需要 argon2 哈希）
--  2. 中文分词升级：安装 pg_jieba 后，把 fn_article_search_vector 里的 'simple'
--     改为 'jiebacfg'，再 UPDATE articles SET title = title 触发一次全量重建
--  3. Prisma 同步：Step 5 会按本脚本生成等价的 prisma/schema.prisma，
--     使 ORM 与数据库定义保持一致
-- =============================================================================
