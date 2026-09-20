"""Run against a disposable Docker Postgres container with CamNook migrations applied.
Usage: python3 supabase/tests/database/025_meetup_concurrency.py CONTAINER
The fixture commits test rows; never use a shared or production database.
"""
import subprocess
import sys
import time
from pathlib import Path

container = sys.argv[1]
command = ['docker', 'exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
def query(sql):
    return subprocess.run(command, input=sql, text=True, capture_output=True, check=True).stdout
fixture = Path(__file__).with_name('024_lender_meetup_places.sql').read_text()
fixture = fixture[:fixture.index('do $$ begin\n begin\n  perform api.assign_camera_meetup_places')]
query(fixture + '\ncommit;')
place = query("select id from public.meetup_places where name='Mall main entrance';").strip()
assert len(place) == 36
edit = f"""begin;
set local role authenticated;
set local "request.jwt.claim.sub"='d0000000-0000-4000-8000-000000000001';
select api.save_meetup_place(jsonb_build_object('id','{place}','version',1,'name','Changed entrance','address','Public road, Cebu City','city','Cebu City','latitude',10.999999,'longitude',123.999999,'source','manual_pin'));
select 'LOCKED';
select pg_sleep(2);
commit;
"""
a = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
a.stdin.write(edit)
a.stdin.close()
while True:
    line = a.stdout.readline()
    if line.strip() == 'LOCKED':
        break
    if not line:
        raise RuntimeError(a.stderr.read())
start = time.monotonic()
b = subprocess.run(command, input=f"""set role service_role;
select api.request_booking_with_place_idempotent('d0000000-0000-4000-8000-000000000002','d0100000-0000-4000-8000-000000000001','2099-08-24','2099-08-26','09:00',1,'Portraits','Cebu City','{place}',1,'d0400000-0000-4000-8000-000000000011');
""", text=True, capture_output=True)
assert b.returncode != 0 and 'meetup_changed' in b.stderr, b.stderr
assert time.monotonic() - start > 1, 'Booking did not wait for the concurrent edit'
assert a.wait() == 0, a.stderr.read()
assert query("select count(*) from public.bookings where renter_id='d0000000-0000-4000-8000-000000000002';").strip() == '0'
print('PASS: booking waits for concurrent place edit, rejects stale selection, and leaves no booking')
