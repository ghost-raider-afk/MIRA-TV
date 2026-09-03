# Spec Kit в MIRA-TV

MIRA-TV использует GitHub Spec Kit `0.15.1` как процесс подготовки и проверки изменений.
Spec Kit является только инструментом разработки: он не входит в Docker image, production
runtime и версию приложения.

## Состав

- `.specify/memory/constitution.md` — обязательные архитектурные и процессные правила MIRA-TV;
- `.specify/templates/` — шаблоны спецификации, плана, задач и проверочных списков;
- `.specify/scripts/bash/` — служебные скрипты workflow;
- `.agents/skills/` — команды Spec Kit для Codex;
- `.specify/extensions/git/` — официальный Git extension для feature-веток;
- `specs/` — спецификации будущих ограниченных изменений, создаваемые по мере работы.

Существующее приложение не описывается задним числом набором фиктивных спецификаций. Spec Kit
применяется к следующей новой задаче или исправлению с чёткими границами.

## Начало задачи

1. Переключиться на явно утверждённую базовую ветку и убедиться, что рабочее дерево чистое.
   Для новой Scene Architecture текущей базой является `prototype`; `main` остаётся стабильной
   линией 1.0.3.
2. Запустить `$speckit-specify` с полным описанием требуемого результата. Git extension создаст
   от текущей базы нумерованную feature-ветку, а Spec Kit — каталог `specs/NNN-short-name/`.
3. Проверить сценарии, критерии приёмки, допущения и явно исключённые изменения в `spec.md`.
4. Если остались существенные неоднозначности, выполнить `$speckit-clarify`.
5. Выполнить `$speckit-plan`, затем `$speckit-tasks`.
6. Для изменения нескольких контрактов или runtime-границ выполнить `$speckit-analyze` и
   устранить найденные противоречия.
7. После утверждения спецификации и плана владельцем выполнить `$speckit-implement`.

Создание ветки автоматизировано, а auto-commit по умолчанию отключён. Push, Pull Request, merge,
release и production update выполняются только после отдельного явного разрешения.

## Контроль качества

Каждый `plan.md` обязан пройти Constitution Check. Применимые тесты выбираются по месту причины:
unit, integration, browser, Preview/Player parity, production image или multi-TV. Перед Pull
Request выполняются проверки из `CONTRIBUTING.md` и просматривается полный diff.

Спецификация отвечает на вопросы «что» и «зачем». Технический способ, затронутые модули,
совместимость, миграции, производительность и rollback фиксируются в плане. Реальные изменения
раскладываются на небольшие проверяемые шаги в `tasks.md`.

## Проверка установки

Команды запускаются из корня репозитория с закреплённой версией:

```bash
uvx --from git+https://github.com/github/spec-kit.git@v0.15.1 specify version
uvx --from git+https://github.com/github/spec-kit.git@v0.15.1 specify integration status --json
uvx --from git+https://github.com/github/spec-kit.git@v0.15.1 specify extension list
```

Обновление Spec Kit выполняется отдельным изменением после просмотра release notes и итогового
diff. Повторный `specify init --here --force` не является обычным способом ежедневной работы.
