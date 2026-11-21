/*
 * StudyBase Integratie-API v1.0 — client-SDK
 *
 * Dit bestand wordt automatisch in HTML-apps ge\u00efnjecteerd die vanuit
 * "Mijn Apps" in een sandbox-iframe worden uitgevoerd. De SDK communiceert
 * via window.postMessage met het hoofdplatform (protocol studybase-integration/1.0).
 *
 * Gebruik in een ge\u00efmporteerde app:
 *   StudyBase.ready();
 *   StudyBase.sendResult({ questionId: 'q1', question: 'Wat is BTW?', answer: '21%', isCorrect: true, score: 1, objectiveIds: ['...'], timeS: 12 });
 *   StudyBase.sendSummary({ score: 8, maxScore: 10, timeS: 320 });
 *   const info = StudyBase.info(); // protocolversie + appId
 *   StudyBase.isIntegrated();      // true wanneer het platform READY heeft bevestigd
 *
 * Velden in het resultaatobject (allen optioneel behalve minimaal \u00e9\u00e9n van isCorrect/score):
 *   appId (automatisch ingevuld), attemptId, subjectId, chapterId, objectiveIds,
 *   questionId, question, answer, isCorrect, score, timeS, completedAt
 */
(function () {
  'use strict';
  var PROTOCOL = 'studybase-integration/1.0';
  var ready = false;
  var pending = [];

  function post(msg) {
    try { window.parent.postMessage(msg, '*'); } catch (e) { /* iframe beperkingen */ }
  }

  function send(msg) {
    msg.protocol = PROTOCOL;
    if (!msg.appId) msg.appId = (window.__studybaseApp && window.__studybaseApp.id) || null;
    if (!msg.completedAt) msg.completedAt = new Date().toISOString();
    if (ready) post(msg); else pending.push(msg);
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.protocol === PROTOCOL && d.type === 'handshake' && d.appId != null) {
      if (!window.__studybaseApp) window.__studybaseApp = {};
      window.__studybaseApp.id = d.appId;
      ready = true;
      var queue = pending; pending = [];
      for (var i = 0; i < queue.length; i++) post(queue[i]);
    }
  });

  window.addEventListener('load', function () {
    send({ type: 'ready' });
  });

  window.StudyBase = {
    version: '1.0',
    protocol: PROTOCOL,
    info: function () {
      return { protocol: PROTOCOL, appId: (window.__studybaseApp && window.__studybaseApp.id) || null, integrated: ready };
    },
    isIntegrated: function () { return ready; },
    ready: function () { send({ type: 'ready' }); },
    sendResult: function (result) {
      if (!result || typeof result !== 'object') return false;
      if (typeof result.isCorrect !== 'boolean' && typeof result.score !== 'number') return false;
      var out = {};
      var fields = ['appId','attemptId','subjectId','chapterId','objectiveIds','questionId','question','answer','isCorrect','score','timeS','completedAt'];
      for (var i = 0; i < fields.length; i++) if (result[fields[i]] !== undefined) out[fields[i]] = result[fields[i]];
      out.type = 'result';
      send(out);
      return true;
    },
    sendSummary: function (summary) {
      if (!summary || typeof summary !== 'object') return false;
      var out = {};
      var fields = ['appId','attemptId','score','maxScore','timeS','completedAt'];
      for (var i = 0; i < fields.length; i++) if (summary[fields[i]] !== undefined) out[fields[i]] = summary[fields[i]];
      out.type = 'summary';
      send(out);
      return true;
    }
  };
})();
