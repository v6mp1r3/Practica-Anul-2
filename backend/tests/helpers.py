"""Small payload builders and a create-and-return helper for the API tests."""


def teacher(**kw):
    return {"name": "Daniel Rusu", "title": "lect. univ.", "department": "Ingineria Software", "email": "daniel.rusu@example.md", "maxPairsPerWeek": 12,
            "activityTypes": ["lecture", "seminar", "lab"], "unavailable": [], "preferred": [], **kw}


def room(**kw):
    return {"name": "3-404", "building": "Blocul 3", "capacity": 60, "type": "lecture", "equipment": [], **kw}


def group(name="FAF-251", **kw):
    return {"name": name, "program": "Ingineria Software", "year": 2, "size": 24, "studyForm": "full", "subgroups": 1, **kw}


def subject(code="AM", **kw):
    return {"code": code, "name": f"Subject {code}", "credits": 5, "year": 2, "lecturePairs": 1, "seminarPairs": 1, "labPairs": 0, **kw}


def assignment(subject_id, teacher_id, audience, **kw):
    return {"subjectId": subject_id, "type": "lecture", "teacherId": teacher_id, "audience": audience, "pairsPerWeek": 1, "parity": "weekly", "roomType": "lecture", "equipment": [], **kw}


def create(client, headers, collection, payload):
    r = client.post(f"/api/{collection}", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


class World:
    """A few records most tests need: two groups, a teacher, two rooms, a subject."""

    def __init__(self, client, headers):
        self.client, self.h = client, headers
        self.g1 = create(client, headers, "groups", group("FAF-251"))
        self.g2 = create(client, headers, "groups", group("FAF-252"))
        self.t1 = create(client, headers, "teachers", teacher())
        self.t2 = create(client, headers, "teachers", teacher(name="Maria Ciobanu", email="maria@example.md"))
        self.r1 = create(client, headers, "rooms", room())
        self.r2 = create(client, headers, "rooms", room(name="3-405"))
        self.s1 = create(client, headers, "subjects", subject("AM"))
        self.s2 = create(client, headers, "subjects", subject("PC"))

    def lecture(self, subj, teacher_, group_ids):
        return create(self.client, self.h, "assignments", assignment(subj["id"], teacher_["id"], {"kind": "stream", "groupIds": group_ids}))

    def seminar(self, subj, teacher_, g):
        return create(self.client, self.h, "assignments", assignment(subj["id"], teacher_["id"], {"kind": "group", "id": g["id"]}, type="seminar", roomType="seminar"))
