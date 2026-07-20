# Acme fixture access model

Every source object carries an access descriptor:

```json
{
  "visibility": "public|group|restricted",
  "allowedGroupIds": ["g-all"],
  "allowedUserIds": []
}
```

- `public` means every fixture identity can retrieve the object.
- `group` requires membership in at least one listed group.
- `restricted` may combine named groups and users; the fixture has no implicit administrator bypass.
- Authorization is evaluated before evidence construction.
- The ground-truth and evaluation directories are never ingestible evidence.

## Evaluation identities

| User | Expected reach |
|---|---|
| Maya Chen (`u-maya`) | Public, engineering, and ClientCore knowledge |
| Owen Park (`u-owen`) | Public, engineering, and TalentFlow knowledge |
| Priya Nair (`u-priya`) | Both products, platform, and leadership material |
| Lena Morales (`u-lena`) | Public, support, ClientCore, and TalentFlow customer-facing knowledge |
| Noah Price (`u-noah`) | Public, finance, and leadership material; no engineering project access by default |

