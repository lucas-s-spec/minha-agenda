// Cole este código em script.google.com (novo projeto) e implante como Web App.
// Execute como: Eu (sua conta) | Quem pode acessar: Qualquer pessoa.
// Depois de implantar, cole a URL do Web App em BACKEND_URL no index.html da extensão.

var SECRET = 'b5b54de57f01b1189be0d911e0bbd2b154e4bcc1';

function doGet(e) {
  try {
    if (e.parameter.token !== SECRET) return jsonOut({ error: 'unauthorized' });
    var action = e.parameter.action;

    if (action === 'ping') {
      return jsonOut({ ok: true, ping: 'pong' });
    }

    if (action === 'events') {
      var days = parseInt(e.parameter.days, 10) || 14;
      var cal = CalendarApp.getDefaultCalendar();
      var start = new Date();
      var end = new Date();
      end.setDate(end.getDate() + days);
      var items = cal.getEvents(start, end).map(function (ev) {
        return {
          id: ev.getId(),
          title: ev.getTitle(),
          start: ev.getStartTime().toISOString(),
          end: ev.getEndTime().toISOString(),
          allDay: ev.isAllDayEvent(),
          description: ev.getDescription()
        };
      });
      return jsonOut({ ok: true, events: items });
    }

    return jsonOut({ error: 'unknown action' });
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (body.token !== SECRET) return jsonOut({ error: 'unauthorized' });

    var cal = CalendarApp.getDefaultCalendar();
    var start = new Date(body.date + 'T' + body.time + ':00');
    var durationMin = parseInt(body.duration, 10) || 30;
    var end = new Date(start.getTime() + durationMin * 60000);

    var options = {};
    if (body.description) options.description = body.description;
    if (body.email) options.guests = body.email;

    var event = cal.createEvent(body.summary || 'Reunião', start, end, options);
    return jsonOut({ ok: true, id: event.getId() });
  } catch (err) {
    return jsonOut({ error: String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
