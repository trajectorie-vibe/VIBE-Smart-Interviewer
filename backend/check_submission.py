import sqlite3

conn = sqlite3.connect('vibe.db')
cursor = conn.cursor()

submission_id = 'd3c3a95e-ca77-4f3c-83bb-3126c89dd47c'
user_id = '8de84dab-1f3e-494e-9afc-51811cfaf13c'

print("=" * 60)
print("CHECKING SUBMISSION")
print("=" * 60)
cursor.execute('SELECT id, candidate_id, user_id, candidate_name, test_type FROM submissions WHERE id = ?', (submission_id,))
result = cursor.fetchone()
if result:
    print(f"Submission found:")
    print(f"  id: {result[0]}")
    print(f"  candidate_id: {result[1]}")
    print(f"  user_id: {result[2]}")
    print(f"  candidate_name: {result[3]}")
    print(f"  test_type: {result[4]}")
else:
    print("Submission NOT FOUND")

print("\n" + "=" * 60)
print("CHECKING USER")
print("=" * 60)
cursor.execute('SELECT id, email, candidate_id, candidate_name FROM users WHERE id = ?', (user_id,))
result = cursor.fetchone()
if result:
    print(f"User found:")
    print(f"  id: {result[0]}")
    print(f"  email: {result[1]}")
    print(f"  candidate_id: {result[2]}")
    print(f"  candidate_name: {result[3]}")
else:
    print("User NOT FOUND")

print("\n" + "=" * 60)
print("CHECKING IF SUBMISSION BELONGS TO USER")
print("=" * 60)
cursor.execute('SELECT id, candidate_id, user_id FROM submissions WHERE user_id = ?', (user_id,))
submissions_for_user = cursor.fetchall()
print(f"Found {len(submissions_for_user)} submissions for user_id={user_id}")
for sub in submissions_for_user:
    print(f"  - Submission {sub[0]}: candidate_id={sub[1]}, user_id={sub[2]}")

conn.close()
