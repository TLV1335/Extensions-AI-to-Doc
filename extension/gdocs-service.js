/**
 * gdocs-service.js
 * Quản lý xác thực OAuth2 linh hoạt và gọi Google Docs REST API v1.
 * Hỗ trợ cả chrome.identity.getAuthToken và chrome.identity.launchWebAuthFlow.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./gdocs-compiler.js'));
  } else {
    root.GDocsService = factory(root.GDocsCompiler);
  }
})(typeof self !== 'undefined' ? self : this, function (compiler) {
  'use strict';

  const GDocsCompiler = compiler || (typeof self !== 'undefined' ? self.GDocsCompiler : null);

  const SCOPES = [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  /**
   * Lấy OAuth2 Token
   */
  async function getAuthToken(interactive = true) {
    if (typeof chrome === 'undefined' || !chrome.identity) {
      throw new Error('Môi trường trình duyệt chưa hỗ trợ chrome.identity API.');
    }

    // 1. Kiểm tra xem đã có token còn hạn lưu trong storage không
    const { oauthToken, tokenExpiry } = await chrome.storage.local.get({ oauthToken: '', tokenExpiry: 0 });
    if (oauthToken && Date.now() < (tokenExpiry - 60000)) {
      return oauthToken;
    }

    // 2. Thử dùng chrome.identity.getAuthToken trước (nếu manifest có oauth2 hợp lệ)
    try {
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive }, (t) => {
          if (chrome.runtime.lastError || !t) {
            reject(new Error((chrome.runtime.lastError && chrome.runtime.lastError.message) || 'No token'));
          } else {
            resolve(t);
          }
        });
      });
      if (token) {
        await saveToken(token, 3600);
        return token;
      }
    } catch (_) {
      // Fallback xuống WebAuthFlow nếu getAuthToken không thành công
    }

    // 3. Sử dụng launchWebAuthFlow nếu người dùng có cấu hình clientId trong storage
    const { googleClientId } = await chrome.storage.local.get({ googleClientId: '' });
    if (!googleClientId) {
      throw new Error('Chưa cấu hình Google OAuth Client ID hoặc chưa đăng nhập Google.');
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', googleClientId.trim());
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', SCOPES.join(' '));
    authUrl.searchParams.set('prompt', interactive ? 'select_account' : 'none');

    const redirectResponse = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive },
        (resUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!resUrl) {
            reject(new Error('Người dùng đã hủy đăng nhập Google.'));
          } else {
            resolve(resUrl);
          }
        }
      );
    });

    const hash = new URL(redirectResponse).hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const expiresIn = Number(params.get('expires_in')) || 3600;

    if (!accessToken) {
      throw new Error('Không nhận được access_token từ Google.');
    }

    await saveToken(accessToken, expiresIn);
    return accessToken;
  }

  async function saveToken(token, expiresInSeconds) {
    const expiry = Date.now() + (expiresInSeconds * 1000);
    const userInfo = await getUserInfo(token);
    await chrome.storage.local.set({
      oauthToken: token,
      tokenExpiry: expiry,
      userEmail: userInfo?.email || '',
      userName: userInfo?.name || '',
      authMode: 'google'
    });
  }

  /**
   * Đăng xuất / Xóa token
   */
  async function logout() {
    const { oauthToken } = await chrome.storage.local.get({ oauthToken: '' });
    if (oauthToken && typeof chrome !== 'undefined' && chrome.identity) {
      try {
        chrome.identity.removeCachedAuthToken({ token: oauthToken }, () => {});
      } catch (_) {}
      fetch(`https://accounts.google.com/o/oauth2/revoke?token=${oauthToken}`).catch(() => {});
    }
    await chrome.storage.local.remove(['oauthToken', 'tokenExpiry', 'userEmail', 'userName']);
  }

  /**
   * Lấy thông tin tài khoản Google
   */
  async function getUserInfo(token) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  /**
   * Lấy tiêu đề tài liệu Google Doc từ Docs API
   */
  async function getDocTitle(docId, token) {
    if (!docId) throw new Error('Chưa cung cấp Doc ID.');
    if (!token) token = await getAuthToken(true);

    const res = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}?fields=title`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.status === 401) {
      await logout();
      throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    }
    if (res.status === 404) {
      throw new Error('Không tìm thấy tài liệu Google Doc này (Kiểm tra lại ID hoặc đường dẫn).');
    }
    if (res.status === 403) {
      throw new Error('Tài khoản Google hiện tại không có quyền truy cập vào tài liệu này.');
    }
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Lỗi từ Google Docs API (${res.status})`);
    }

    const data = await res.json();
    return data.title || 'Google Doc';
  }

  /**
   * Nối nội dung Markdown vào Google Docs
   */
  async function appendMarkdownToDoc(docId, mdText, token) {
    if (!docId) throw new Error('Chưa cấu hình Google Doc ID.');
    if (!mdText || !mdText.trim()) throw new Error('Nội dung gửi rỗng.');

    if (!token) token = await getAuthToken(true);

    // Lấy vị trí cuối cùng của tài liệu
    const docMetaRes = await fetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}?fields=title,body.content`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (docMetaRes.status === 401) {
      await logout();
      throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
    }
    if (docMetaRes.status === 403) {
      throw new Error('Tài khoản Google của bạn không có quyền Chỉnh sửa (Editor) trên tài liệu này.');
    }
    if (!docMetaRes.ok) {
      const errJson = await docMetaRes.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Lỗi truy vấn Google Docs (${docMetaRes.status})`);
    }

    const docMeta = await docMetaRes.json();
    const content = docMeta.body?.content || [];
    let baseIndex = 1;
    if (content.length > 0) {
      const lastElem = content[content.length - 1];
      baseIndex = Math.max((lastElem.endIndex || 2) - 1, 1);
    }

    const cmp = GDocsCompiler || (typeof self !== 'undefined' ? self.GDocsCompiler : null);
    if (!cmp) throw new Error('GDocsCompiler chưa được tải.');

    const { requests } = cmp.compile(mdText, baseIndex, true);
    if (!requests || !requests.length) {
      return { ok: true, docName: docMeta.title || 'Google Doc' };
    }

    const updateRes = await fetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(docId)}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      }
    );

    if (!updateRes.ok) {
      const errJson = await updateRes.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Không thể ghi nội dung vào Google Docs (${updateRes.status})`);
    }

    return {
      ok: true,
      docName: docMeta.title || 'Google Doc'
    };
  }

  return {
    getAuthToken,
    logout,
    getUserInfo,
    getDocTitle,
    appendMarkdownToDoc
  };
});
