"""Meetup edit/booking race, called by the disposable PostgreSQL harness.

The fixture commits rows into a dedicated database cloned by the harness.
Only a socket inside its temporary cluster is accepted; no hosted URL is used.
"""
import argparse
import os
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--psql", required=True)
parser.add_argument("--socket", required=True)
args = parser.parse_args()
# Keep the harness spelling: resolving macOS /var -> /private/var can exceed
# PostgreSQL's Unix socket path-length limit even though the original works.
socket = Path(args.socket).absolute()
if (socket.name != "socket" or
        not socket.parent.name.startswith("camnook-approval-race.") or
        not (socket / ".s.PGSQL.5432").is_socket()):
    raise RuntimeError("Expected the harness-owned disposable PostgreSQL socket")
if os.environ.get("DATABASE_URL"):
    raise RuntimeError("Refusing caller-supplied DATABASE_URL")
command = [args.psql, "-X", "-h", str(socket), "-p", "5432", "-U", "postgres",
           "-d", "camnook_meetup_race", "-v", "ON_ERROR_STOP=1", "-Atq"]
# Bound both SQL execution and subprocess waits if a lock/test unexpectedly stalls.
environment = {**os.environ, "PGOPTIONS": "-c statement_timeout=15000 -c idle_in_transaction_session_timeout=20000"}


def query(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True,
                            timeout=20, env=environment)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout


def wait_for(predicate, description):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise RuntimeError("Timed out waiting for " + description)


fixture = Path(__file__).with_name("024_lender_meetup_places.sql").read_text()
fixture = fixture[:fixture.index("do $$ begin\n begin\n  perform api.assign_camera_meetup_places")]
query(fixture + "\ncommit;")
place = query("select id from public.meetup_places where name='Mall main entrance';").strip()
assert len(place) == 36
sessions = []
try:
    editor = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True, env=environment)
    sessions.append(editor)
    editor.stdin.write(f"""begin;
set local application_name = 'camnook-meetup-editor';
set local role authenticated;
set local "request.jwt.claim.sub"='d0000000-0000-4000-8000-000000000001';
select api.save_meetup_place(jsonb_build_object('id','{place}','version',1,'name','Changed entrance','address','Public road, Cebu City','city','Cebu City','latitude',10.999999,'longitude',123.999999,'source','manual_pin'));
""")
    editor.stdin.flush()
    wait_for(lambda: query("""select count(*) from pg_stat_activity
      where application_name='camnook-meetup-editor' and state='idle in transaction';""").strip() == "1",
             "the owner edit to hold its uncommitted lock")

    booking = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True, env=environment)
    sessions.append(booking)
    booking.stdin.write(f"""set application_name = 'camnook-meetup-booking';
set role service_role;
select api.request_booking_with_place_idempotent('d0000000-0000-4000-8000-000000000002','d0100000-0000-4000-8000-000000000001','2099-08-24','2099-08-26','09:00',1,'Portraits','Cebu City','{place}',1,'d0400000-0000-4000-8000-000000000011');
""")
    booking.stdin.close()
    booking.stdin = None
    wait_for(lambda: query("""select count(*) from pg_stat_activity as waiting
      where waiting.application_name='camnook-meetup-booking'
        and waiting.wait_event_type='Lock'
        and exists (select 1 from pg_stat_activity as editor
          where editor.application_name='camnook-meetup-editor'
            and editor.pid = any(pg_blocking_pids(waiting.pid)));""").strip() == "1",
             "booking to block on the owner edit")

    editor.stdin.write("commit;\n")
    editor.stdin.close()
    editor.stdin = None
    _, editor_error = editor.communicate(timeout=20)
    assert editor.returncode == 0, editor_error
    _, booking_error = booking.communicate(timeout=20)
    assert booking.returncode != 0 and "meetup_changed" in booking_error, booking_error
    assert query("select count(*) from public.bookings where renter_id='d0000000-0000-4000-8000-000000000002';").strip() == "0"
    print("ok - booking waits for concurrent meetup edit, rejects stale selection, and leaves no booking")
finally:
    for session in sessions:
        if session.poll() is None:
            session.kill()
            session.communicate(timeout=5)
