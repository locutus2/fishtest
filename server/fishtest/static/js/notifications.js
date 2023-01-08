function LRU(capacity, content) {
  if (!content) {
    content = [];
  }
  if (typeof capacity != "number") {
    throw "capacity is not a number";
  }
  if (!(content instanceof Array)) {
    throw "content is not an Array";
  }
  return {
    capacity: capacity,
    content: content,
    count() {
      return this.content.length;
    },
    add(elt) {
      if (this.contains(elt)) {
        return null;
      } else {
        this.content.push(elt);
        if (this.content.length > this.capacity) {
          const drop = this.content[0];
          this.content.shift();
          return drop;
        } else {
          return null;
        }
      }
    },
    contains(elt) {
      return this.content.findIndex((x) => x == elt) != -1;
    },
    save(name) {
      localStorage.setItem(name, JSON.stringify(this));
    },
    remove(elt) {
      idx = this.content.findIndex((x) => x == elt);
      if (idx == -1) {
        return;
      } else {
        this.content.splice(idx, 1);
      }
    },
  };
}

LRU.load = function (name) {
  let json = JSON.parse(localStorage.getItem(name));
  return new LRU(json["capacity"], json["content"]);
};

const fishtest_notifications_key = "fishtest_notifications";

function notify_fishtest_(message) {
  const div = document.getElementById("fallback_div");
  const span = document.getElementById("fallback");
  const fallback_div = document.getElementById("fallback_div");
  if (fallback_div.style.display == "none") {
    span.innerHTML = message;
  } else {
    span.innerHTML += "<hr> " + message;
  }
  let count = span.innerHTML.split("<hr>").length;
  process_title(count);
  div.style.display = "block";
}

function notify_fishtest(message) {
  broadcast("notify_fishtest_", message);
}

function notify_elo(entry) {
  const tag = entry["run"].slice(0, -8);
  const message = entry["message"];
  const username = entry["username"];
  const color = message.split(" ")[0].split(":")[1];
  const elo = message.split(" ")[1];
  const LOS = message.split(" ")[2];
  const title = `Test ${tag} by ${username} finished ${color}!`;
  const body = elo + " " + LOS;
  const link = `/tests/view/${entry["run_id"]}`;
  notify(title, body, link, (title, body, link) => {
    const message = `<a href=${link}>${title} ${body}</a>`;
    notify_fishtest(message);
  });
}

const design_capacity = 15;

function get_notifications() {
  let notifications;
  try {
    notifications = LRU.load(fishtest_notifications_key);
    if (notifications["capacity"] != design_capacity) {
      throw "";
    }
    return notifications;
  } catch (e) {
    console.log("Initializing new LRU object");
    notifications = new LRU(design_capacity);
    notifications.save(fishtest_notifications_key);
    return notifications;
  }
}

function save_notifications(notifications) {
  notifications.save(fishtest_notifications_key);
}

async function main_follow_loop() {
  await DOM_loaded();
  async_sleep(10000);
  while (true) {
    let json;
    let notifications = get_notifications();
    try {
      json = await fetch_post("/api/actions", {
        action: "finished_run",
        run_id: { $in: notifications.content },
      });
    } catch (e) {
      console.log(e);
      await async_sleep(20000);
      continue;
    }
    notifications = get_notifications();
    let work = [];
    json.forEach((entry) => {
      let run_id = entry["run_id"];
      if (notifications.contains(run_id)) {
        work.push(entry);
        notifications.remove(run_id);
      }
    });
    save_notifications(notifications); // make sure other tabs see up to date data
    // Instrumentation
    console.log("active notifications: ", JSON.stringify(notifications));
    work.forEach((entry) => {
      notify_elo(entry);
      run_id = entry["run_id"];
      set_notification_status(run_id);
      disable_notification(run_id);
    });
    await async_sleep(20000);
  }
}

function follow_run(run_id) {
  let notifications = get_notifications();
  const ret = notifications.add(run_id);
  save_notifications(notifications);
  return ret;
}

function unfollow_run(run_id) {
  let notifications = get_notifications();
  notifications.remove(run_id);
  save_notifications(notifications);
}

function following_run(run_id) {
  let notifications = get_notifications();
  return notifications.contains(run_id);
}

function set_notification_status_(run_id) {
  let button = document.getElementById(`follow_button_${run_id}`);
  if (button) {
    if (following_run(run_id)) {
      button.textContent = "Unfollow";
    } else {
      button.textContent = "Follow";
    }
    button.style.display = "";
  }

  let notification_id = "notification_" + run_id;
  let notification = document.getElementById(notification_id);
  if (notification) {
    if (following_run(run_id)) {
      notification.title = "Click to unfollow: no notification";
      notification.innerHTML =
        "<div style='white-space:nowrap;'><i class='fa-regular fa-bell' style='width:20px;'></i><i class='fa-solid fa-toggle-on'></i></div>";
    } else {
      notification.title = "Click to follow: get notification";
      notification.innerHTML =
        "<div style='white-space:nowrap;'><i class='fa-regular fa-bell-slash' style='width:20px;'></i><i class='fa-solid fa-toggle-off'></i></div>";
    }
  }
}

function set_notification_status(run_id) {
  broadcast("set_notification_status_", run_id);
}

function toggle_notifaction_status(run_id) {
  if (!following_run(run_id)) {
    if (supportsNotifications() && Notification.permission === "default") {
      Notification.requestPermission();
    }
    const drop = follow_run(run_id);
    if (drop) {
      set_notification_status(drop);
    }
  } else {
    unfollow_run(run_id);
  }
  set_notification_status(run_id);
}

// old style callback on main page: onclick="handle_notification(this)"
function handle_notification(notification) {
  run_id = notification.id.split("_")[1];
  toggle_notifaction_status(run_id);
}

// old style callback on tests_view page
function handle_follow_button(button) {
  run_id = button.id.split("_")[2];
  toggle_notifaction_status(run_id);
}

function disable_notification_(run_id) {
  let button = document.getElementById(`follow_button_${run_id}`);
  if (button) {
    button.disabled = 1;
  }

  let notification_id = "notification_" + run_id;
  let notification = document.getElementById(notification_id);
  if (notification) {
    notification.style.opacity = 0.5;
    notification.style["pointer-events"] = "none";
  }
}

function disable_notification(run_id) {
  broadcast("disable_notification_", run_id);
}

broadcast_dispatch["notify_fishtest_"] = notify_fishtest_;
broadcast_dispatch["set_notification_status_"] = set_notification_status_;
broadcast_dispatch["disable_notification_"] = disable_notification_;

main_follow_loop();