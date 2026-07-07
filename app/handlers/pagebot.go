package handlers

import (
	"regexp"
	"strings"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/errors"
	"github.com/getfider/fider/app/pkg/web"
	webutil "github.com/getfider/fider/app/pkg/web/util"
)

var pagebotSSOPartPattern = regexp.MustCompile(`[^a-z0-9._-]+`)

// PagebotSSO creates or reuses a regular visitor from Pagebot SDK identity.
func PagebotSSO() web.HandlerFunc {
	return func(c *web.Context) error {
		userID := strings.TrimSpace(c.QueryParam("userId"))
		systemKey := strings.TrimSpace(c.QueryParam("systemKey"))
		if userID == "" || systemKey == "" {
			return c.Redirect("/")
		}

		email := pagebotSSOEmail(systemKey, userID)
		userByEmail := &query.GetUserByEmail{Email: email}
		err := bus.Dispatch(c, userByEmail)

		user := userByEmail.Result
		if err != nil {
			if errors.Cause(err) != app.ErrNotFound {
				return c.Failure(err)
			}

			user = &entity.User{
				Name:   pagebotSSOName(c.QueryParam("name"), systemKey),
				Email:  email,
				Tenant: c.Tenant(),
				Role:   enum.RoleVisitor,
			}
			if err := bus.Dispatch(c, &cmd.RegisterUser{User: user}); err != nil {
				return c.Failure(err)
			}
		}

		webutil.AddAuthUserCookie(c, user)
		return c.Redirect(pagebotSSORedirect(c.QueryParam("redirect")))
	}
}

func pagebotSSOEmail(systemKey, userID string) string {
	system := pagebotSSOClean(systemKey)
	user := pagebotSSOClean(userID)
	return "pagebot+" + system + "." + user + "@pagebot.local"
}

func pagebotSSOName(name, fallback string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = strings.TrimSpace(fallback)
	}
	if name == "" {
		return "Usuario Pagebot"
	}
	runes := []rune(name)
	if len(runes) > 100 {
		return string(runes[:100])
	}
	return name
}

func pagebotSSOClean(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = pagebotSSOPartPattern.ReplaceAllString(value, "-")
	value = strings.Trim(value, ".-_")
	if value == "" {
		return "unknown"
	}
	if len(value) > 48 {
		return value[:48]
	}
	return value
}

func pagebotSSORedirect(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") {
		return "/"
	}
	return value
}
